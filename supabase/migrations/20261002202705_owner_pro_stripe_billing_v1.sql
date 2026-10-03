-- Owner Pro billing is an authoring entitlement only. Payment never affects
-- organic ranking, recommendation eligibility, or World Knowledge truth.
create table public.owner_pro_billing_v1 (
  -- A spot or account with a live Stripe subscription must be canceled first;
  -- cascading deletion would otherwise leave an invisible recurring charge.
  spot_id uuid primary key references public.spots(id),
  owner_id uuid not null references public.profiles(id),
  checkout_nonce uuid,
  checkout_expires_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text not null default 'CHECKOUT_PENDING'
    check (subscription_status in ('CHECKOUT_PENDING','INCOMPLETE','ACTIVE','PAST_DUE','UNPAID','PAUSED','CANCELED')),
  paid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((subscription_status <> 'CHECKOUT_PENDING') or (checkout_nonce is not null and checkout_expires_at is not null)),
  check (stripe_subscription_id is null or (stripe_customer_id is not null and stripe_price_id is not null))
);

create index owner_pro_billing_owner_idx on public.owner_pro_billing_v1 (owner_id, spot_id);

create table public.owner_pro_billing_events_v1 (
  stripe_event_id text primary key,
  stripe_event_type text not null,
  spot_id uuid not null references public.spots(id) on delete cascade,
  processed_at timestamptz not null default now()
);

alter table public.owner_pro_billing_v1 enable row level security;
alter table public.owner_pro_billing_events_v1 enable row level security;
revoke all on public.owner_pro_billing_v1, public.owner_pro_billing_events_v1 from public, anon, authenticated;
grant select, insert, update, delete on public.owner_pro_billing_v1, public.owner_pro_billing_events_v1 to service_role;

create function public.owner_pro_billing_sync_entitlement_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subscription_status = 'ACTIVE'
    and new.paid_until > now()
    and exists (select 1 from public.spots s where s.id = new.spot_id and s.owner_id = new.owner_id)
  then
    insert into public.backyrd_spot_owner_intelligence_entitlements_v1
      (spot_id, owner_id, tier, source, valid_from, valid_until, updated_at)
    values (new.spot_id, new.owner_id, 'PREMIUM', 'BILLING_VERIFIED', now(), new.paid_until, now())
    on conflict (spot_id) do update set
      owner_id = excluded.owner_id, tier = 'PREMIUM', source = 'BILLING_VERIFIED',
      valid_from = now(), valid_until = excluded.valid_until, updated_at = now()
    where public.backyrd_spot_owner_intelligence_entitlements_v1.source in ('SYSTEM_DEFAULT','BILLING_VERIFIED');
  else
    update public.backyrd_spot_owner_intelligence_entitlements_v1 e
    set tier = 'FREE', valid_until = null, updated_at = now()
    where e.spot_id = new.spot_id and e.owner_id = new.owner_id and e.source = 'BILLING_VERIFIED';
  end if;
  return new;
end;
$$;
revoke all on function public.owner_pro_billing_sync_entitlement_v1() from public, anon, authenticated;
create trigger owner_pro_billing_sync_entitlement_trigger_v1
after insert or update on public.owner_pro_billing_v1
for each row execute function public.owner_pro_billing_sync_entitlement_v1();

-- A short reservation prevents two simultaneous checkouts for one spot.
create function public.owner_pro_billing_reserve_checkout_v1(
  p_spot_id uuid, p_owner_id uuid, p_checkout_nonce uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_current public.owner_pro_billing_v1%rowtype;
begin
  if p_spot_id is null or p_owner_id is null or p_checkout_nonce is null
    or not exists (select 1 from public.spots s where s.id = p_spot_id and s.owner_id = p_owner_id and s.status::text = 'approved')
  then return false; end if;

  -- Serialize the first insert as well as all later reservations for this spot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_spot_id::text, 90731));
  select * into v_current from public.owner_pro_billing_v1 where spot_id = p_spot_id for update;
  if found and (
    v_current.owner_id <> p_owner_id
    or (v_current.stripe_subscription_id is not null and v_current.subscription_status <> 'CANCELED')
    or (v_current.subscription_status = 'CHECKOUT_PENDING' and v_current.checkout_expires_at > now())
  ) then return false; end if;

  insert into public.owner_pro_billing_v1
    (spot_id, owner_id, checkout_nonce, checkout_expires_at, subscription_status, updated_at)
  values (p_spot_id, p_owner_id, p_checkout_nonce, now() + interval '35 minutes', 'CHECKOUT_PENDING', now())
  on conflict (spot_id) do update set
    checkout_nonce = excluded.checkout_nonce,
    checkout_expires_at = excluded.checkout_expires_at,
    stripe_checkout_session_id = null,
    stripe_customer_id = null,
    stripe_subscription_id = null,
    stripe_price_id = null,
    paid_until = null,
    cancel_at_period_end = false,
    subscription_status = 'CHECKOUT_PENDING',
    updated_at = now();
  return true;
end;
$$;
revoke all on function public.owner_pro_billing_reserve_checkout_v1(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_pro_billing_reserve_checkout_v1(uuid, uuid, uuid) to service_role;

create function public.owner_pro_billing_release_checkout_v1(
  p_spot_id uuid, p_owner_id uuid, p_checkout_nonce uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.owner_pro_billing_v1
  set subscription_status = 'CANCELED', checkout_nonce = null,
      checkout_expires_at = null, stripe_checkout_session_id = null,
      updated_at = now()
  where spot_id = p_spot_id and owner_id = p_owner_id and checkout_nonce = p_checkout_nonce
    and subscription_status = 'CHECKOUT_PENDING' and stripe_subscription_id is null;
  return found;
end;
$$;
revoke all on function public.owner_pro_billing_release_checkout_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.owner_pro_billing_release_checkout_v1(uuid,uuid,uuid) to service_role;

-- Called only after the server verifies a signed Stripe event and retrieves
-- the current subscription directly from Stripe. The event ID is deduplicated
-- in the same transaction as the subscription and entitlement updates.
create function public.owner_pro_billing_apply_stripe_v1(
  p_event_id text, p_event_type text, p_spot_id uuid, p_owner_id uuid,
  p_checkout_nonce uuid, p_customer_id text, p_subscription_id text,
  p_price_id text, p_status text, p_paid_until timestamptz,
  p_cancel_at_period_end boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_current public.owner_pro_billing_v1%rowtype;
begin
  if p_event_id is null or length(p_event_id) > 255 or p_event_type is null
    or length(p_event_type) > 100 or p_spot_id is null or p_owner_id is null
    or p_checkout_nonce is null or p_customer_id is null or p_subscription_id is null
    or p_price_id is null or p_status not in ('INCOMPLETE','ACTIVE','PAST_DUE','UNPAID','PAUSED','CANCELED')
  then return false; end if;

  select * into v_current from public.owner_pro_billing_v1 where spot_id = p_spot_id for update;
  if not found or v_current.owner_id <> p_owner_id
    or v_current.checkout_nonce <> p_checkout_nonce
    or (v_current.stripe_subscription_id is not null and v_current.stripe_subscription_id <> p_subscription_id)
    or (v_current.stripe_customer_id is not null and v_current.stripe_customer_id <> p_customer_id)
  then return false; end if;

  insert into public.owner_pro_billing_events_v1 (stripe_event_id, stripe_event_type, spot_id)
  values (p_event_id, p_event_type, p_spot_id) on conflict do nothing;
  if not found then return true; end if;

  update public.owner_pro_billing_v1 set
    stripe_customer_id = p_customer_id,
    stripe_subscription_id = p_subscription_id,
    stripe_price_id = p_price_id,
    subscription_status = p_status,
    paid_until = p_paid_until,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
    checkout_expires_at = null,
    updated_at = now()
  where spot_id = p_spot_id;
  return true;
end;
$$;
revoke all on function public.owner_pro_billing_apply_stripe_v1(text,text,uuid,uuid,uuid,text,text,text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.owner_pro_billing_apply_stripe_v1(text,text,uuid,uuid,uuid,text,text,text,text,timestamptz,boolean) to service_role;
