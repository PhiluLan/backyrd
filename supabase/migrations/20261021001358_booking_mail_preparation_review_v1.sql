begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.booking_restaurant_settings in exclusive mode;
-- A provider-suppressed message was not delivered and must not be called a
-- bounce. Widen the existing event contract atomically, preserving all rows.
alter table booking_private.guest_mail_events_v1 drop constraint guest_mail_events_v1_event_kind_check;
alter table booking_private.guest_mail_events_v1 add constraint guest_mail_events_v1_event_kind_check check (event_kind in ('accepted','delayed','delivered','bounced','complained','failed','suppressed'));
create or replace function booking_private.mail_state_rank_v1(p_state text) returns integer language sql immutable set search_path='' as $$
 select case p_state when 'complained' then 5 when 'bounced' then 4 when 'suppressed' then 4 when 'delivered' then 3 when 'failed' then 2 when 'accepted' then 1 else 0 end;
$$;
create or replace function public.booking_mail_finish_v1(p_id uuid,p_lease_id uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare o booking_private.guest_mail_outbox_v1%rowtype; observed timestamptz; next_state text; begin
 if p_outcome is null or p_outcome not in ('accepted','retry','rejected','review') or
  (p_outcome='accepted' and (p_provider_id is null or length(p_provider_id) not between 1 and 128 or p_provider_id !~ '^[A-Za-z0-9_.-]+$')) or (p_outcome<>'accepted' and p_provider_id is not null) then raise exception 'invalid_booking_mail_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=(select spot_id from booking_private.guest_mail_outbox_v1 where id=p_id) for update;
 select * into o from booking_private.guest_mail_outbox_v1 where id=p_id for update;
 observed:=clock_timestamp();
 if not found or o.lease_id is distinct from p_lease_id then return false; end if;
 if o.state='leased' and p_outcome='review' and o.lease_until>observed then
  update booking_private.guest_mail_outbox_v1 set state='review_required',last_error_code='preparation_review_required',lease_id=null,lease_until=null,updated_at=observed where id=o.id;
  return true;
 end if;
 if o.state<>'sending' then return false; end if;
 next_state:=case when p_outcome='accepted' then 'accepted' when p_outcome='rejected' then 'failed'
  when p_outcome='review' or o.superseded_at is not null or o.attempts>=8 or o.first_attempt_at<=observed-interval '23 hours' then 'review_required' else 'pending' end;
 update booking_private.guest_mail_outbox_v1 set state=next_state,provider_id=coalesce(p_provider_id,provider_id),lease_id=null,lease_until=null,
  last_error_code=case when p_outcome='accepted' then null when p_outcome='rejected' then 'provider_rejected' when next_state='pending' then 'provider_unconfirmed' else 'manual_review_required' end,
  next_attempt_at=case when next_state='pending' then observed+make_interval(secs=>least(3600,30*power(2,least(o.attempts-1,7)))::integer) else next_attempt_at end,updated_at=observed where id=o.id;
 return true;
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
 if p_kind in ('bounced','complained','suppressed') then
  update booking_private.guest_access_v1 set delivery_blocked_at=coalesce(delivery_blocked_at,clock_timestamp()) where reservation_id=o.reservation_id;
  update booking_private.guest_mail_outbox_v1 set superseded_at=coalesce(superseded_at,clock_timestamp()),state=case when state in ('pending','leased') then case when first_attempt_at is null then 'suppressed' else 'review_required' end else state end,updated_at=clock_timestamp() where reservation_id=o.reservation_id and state in ('pending','leased','sending');
 end if;
 return true;
end $$;

revoke all on function public.booking_mail_finish_v1(uuid,uuid,text,text),public.booking_mail_event_v1(text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.booking_mail_finish_v1(uuid,uuid,text,text),public.booking_mail_event_v1(text,uuid,text,text,timestamptz) to service_role;
commit;
