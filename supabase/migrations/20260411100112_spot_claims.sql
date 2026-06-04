-- 20260411100112_spot_claims.sql
-- Owner / Claim Workflow für Backyrd
--
-- Ziel:
-- - Spots sauber claimbar machen
-- - Claim-Prozess serverseitig und datenbankseitig abbilden
-- - owner_id auf spots nicht direkt "irgendwie" setzen,
--   sondern über einen nachvollziehbaren Workflow
-- - Grundlage für Admin / Owner Dashboard schaffen

-- ----------------------------------------
-- 1) Claim-Tabelle
-- ----------------------------------------

create table if not exists public.spot_claims (
  id uuid primary key default gen_random_uuid(),

  spot_id uuid not null references public.spots(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'pending',

  business_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,

  message text,
  proof_note text,

  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spot_claims_status_check check (
    status in ('pending', 'approved', 'rejected', 'withdrawn')
  )
);

create index if not exists idx_spot_claims_spot_id
  on public.spot_claims(spot_id);

create index if not exists idx_spot_claims_claimant_id
  on public.spot_claims(claimant_id);

create index if not exists idx_spot_claims_status
  on public.spot_claims(status);

create index if not exists idx_spot_claims_created_at
  on public.spot_claims(created_at desc);

create unique index if not exists uq_spot_claims_one_pending_per_spot_claimant
  on public.spot_claims(spot_id, claimant_id)
  where status = 'pending';

drop trigger if exists trg_spot_claims_set_updated_at on public.spot_claims;
create trigger trg_spot_claims_set_updated_at
before update on public.spot_claims
for each row
execute function public.set_updated_at();

-- ----------------------------------------
-- 2) Hilfsfunktion: ist aktueller User Admin?
-- ----------------------------------------

create or replace function public.is_admin_v1(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and coalesce(p.is_admin, false) = true
  );
$$;

-- ----------------------------------------
-- 3) Claim erstellen
-- ----------------------------------------
-- Regeln:
-- - nur authenticated User
-- - Spot muss existieren
-- - User darf nicht schon Owner des Spots sein
-- - es darf kein eigener offener Pending-Claim für denselben Spot existieren

create or replace function public.create_spot_claim_v1(
  p_spot_id uuid,
  p_business_name text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_website text default null,
  p_message text default null,
  p_proof_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_spot record;
  v_existing_pending uuid;
  v_claim public.spot_claims%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_spot
  from public.spots s
  where s.id = p_spot_id
  limit 1;

  if v_spot.id is null then
    raise exception 'Spot not found';
  end if;

  if v_spot.owner_id = v_user_id then
    raise exception 'You already own this spot';
  end if;

  select sc.id
  into v_existing_pending
  from public.spot_claims sc
  where sc.spot_id = p_spot_id
    and sc.claimant_id = v_user_id
    and sc.status = 'pending'
  limit 1;

  if v_existing_pending is not null then
    raise exception 'Pending claim already exists for this spot';
  end if;

  insert into public.spot_claims (
    spot_id,
    claimant_id,
    status,
    business_name,
    contact_name,
    contact_email,
    contact_phone,
    website,
    message,
    proof_note
  )
  values (
    p_spot_id,
    v_user_id,
    'pending',
    nullif(trim(p_business_name), ''),
    nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_email), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_website), ''),
    nullif(trim(p_message), ''),
    nullif(trim(p_proof_note), '')
  )
  returning *
  into v_claim;

  return jsonb_build_object(
    'claim', jsonb_build_object(
      'id', v_claim.id,
      'spot_id', v_claim.spot_id,
      'claimant_id', v_claim.claimant_id,
      'status', v_claim.status,
      'business_name', v_claim.business_name,
      'contact_name', v_claim.contact_name,
      'contact_email', v_claim.contact_email,
      'contact_phone', v_claim.contact_phone,
      'website', v_claim.website,
      'message', v_claim.message,
      'proof_note', v_claim.proof_note,
      'created_at', v_claim.created_at
    )
  );
end;
$$;

-- ----------------------------------------
-- 4) Eigenen Claim zurückziehen
-- ----------------------------------------

create or replace function public.withdraw_spot_claim_v1(
  p_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_claim public.spot_claims%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_claim
  from public.spot_claims sc
  where sc.id = p_claim_id
    and sc.claimant_id = v_user_id
  limit 1;

  if v_claim.id is null then
    raise exception 'Claim not found';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'Only pending claims can be withdrawn';
  end if;

  update public.spot_claims
  set
    status = 'withdrawn',
    updated_at = now()
  where id = p_claim_id
  returning *
  into v_claim;

  return jsonb_build_object(
    'claim', jsonb_build_object(
      'id', v_claim.id,
      'spot_id', v_claim.spot_id,
      'claimant_id', v_claim.claimant_id,
      'status', v_claim.status,
      'updated_at', v_claim.updated_at
    )
  );
end;
$$;

-- ----------------------------------------
-- 5) Claim entscheiden (Admin)
-- ----------------------------------------
-- Wenn approved:
-- - spot.owner_id wird auf claimant gesetzt
-- - alle anderen pending claims für diesen spot werden rejected
--
-- Wichtig:
-- Das ist der zentrale serverseitige Workflow.
-- Clients sollen owner_id nicht direkt setzen.

create or replace function public.decide_spot_claim_v1(
  p_claim_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_claim public.spot_claims%rowtype;
  v_decision text;
begin
  v_user_id := auth.uid();
  v_decision := lower(trim(p_decision));

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select *
  into v_claim
  from public.spot_claims sc
  where sc.id = p_claim_id
  limit 1;

  if v_claim.id is null then
    raise exception 'Claim not found';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'Only pending claims can be decided';
  end if;

  update public.spot_claims
  set
    status = v_decision,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    decision_note = nullif(trim(p_decision_note), ''),
    updated_at = now()
  where id = p_claim_id
  returning *
  into v_claim;

  if v_decision = 'approved' then
    update public.spots
    set
      owner_id = v_claim.claimant_id,
      updated_at = now()
    where id = v_claim.spot_id;

    update public.spot_claims
    set
      status = 'rejected',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      decision_note = coalesce(decision_note, 'Auto-rejected because another claim was approved'),
      updated_at = now()
    where spot_id = v_claim.spot_id
      and id <> v_claim.id
      and status = 'pending';
  end if;

  return jsonb_build_object(
    'claim', jsonb_build_object(
      'id', v_claim.id,
      'spot_id', v_claim.spot_id,
      'claimant_id', v_claim.claimant_id,
      'status', v_claim.status,
      'reviewed_by', v_claim.reviewed_by,
      'reviewed_at', v_claim.reviewed_at,
      'decision_note', v_claim.decision_note
    )
  );
end;
$$;

-- ----------------------------------------
-- 6) Spot-Claim-Detail RPC
-- ----------------------------------------
-- Für Admin und später Owner-Flows

create or replace function public.get_spot_claim_detail_v1(
  p_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  result_json jsonb;
begin
  v_user_id := auth.uid();
  v_is_admin := case
    when v_user_id is null then false
    else public.is_admin_v1(v_user_id)
  end;

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'id', sc.id,
    'status', sc.status,
    'business_name', sc.business_name,
    'contact_name', sc.contact_name,
    'contact_email', sc.contact_email,
    'contact_phone', sc.contact_phone,
    'website', sc.website,
    'message', sc.message,
    'proof_note', sc.proof_note,
    'decision_note', sc.decision_note,
    'reviewed_at', sc.reviewed_at,
    'created_at', sc.created_at,
    'updated_at', sc.updated_at,
    'spot', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'slug', s.slug,
      'city', s.city,
      'status', s.status,
      'owner_id', s.owner_id
    ),
    'claimant', jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url
    ),
    'reviewed_by', case
      when rp.id is null then null
      else jsonb_build_object(
        'id', rp.id,
        'first_name', rp.first_name,
        'last_name', rp.last_name,
        'full_name', rp.full_name
      )
    end
  )
  into result_json
  from public.spot_claims sc
  join public.spots s on s.id = sc.spot_id
  join public.profiles p on p.id = sc.claimant_id
  left join public.profiles rp on rp.id = sc.reviewed_by
  where sc.id = p_claim_id
    and (
      v_is_admin = true
      or sc.claimant_id = v_user_id
      or s.owner_id = v_user_id
    )
  limit 1;

  if result_json is null then
    raise exception 'Claim not found or access denied';
  end if;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 7) Meine Claims
-- ----------------------------------------

create or replace function public.get_my_spot_claims_v1(
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_status := nullif(lower(trim(p_status)), '');
  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'withdrawn') then
    raise exception 'Invalid status filter';
  end if;

  with filtered as (
    select
      sc.*,
      s.name as spot_name,
      s.slug as spot_slug,
      s.city as spot_city,
      s.status as spot_status,
      s.owner_id as spot_owner_id
    from public.spot_claims sc
    join public.spots s on s.id = sc.spot_id
    where sc.claimant_id = v_user_id
      and (
        v_status is null
        or sc.status = v_status
      )
  ),
  total_count as (
    select count(*)::integer as total
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'spot_id', p.spot_id,
            'status', p.status,
            'business_name', p.business_name,
            'contact_name', p.contact_name,
            'contact_email', p.contact_email,
            'contact_phone', p.contact_phone,
            'website', p.website,
            'message', p.message,
            'proof_note', p.proof_note,
            'decision_note', p.decision_note,
            'reviewed_at', p.reviewed_at,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'spot', jsonb_build_object(
              'id', p.spot_id,
              'name', p.spot_name,
              'slug', p.spot_slug,
              'city', p.spot_city,
              'status', p.spot_status,
              'owner_id', p.spot_owner_id
            )
          )
          order by p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
    'limit',
    v_limit,
    'offset',
    v_offset
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 8) Admin Inbox für Claims
-- ----------------------------------------

create or replace function public.get_claim_queue_v1(
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  v_status := nullif(lower(trim(p_status)), '');
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'withdrawn') then
    raise exception 'Invalid status filter';
  end if;

  with filtered as (
    select
      sc.*,
      s.name as spot_name,
      s.slug as spot_slug,
      s.city as spot_city,
      s.owner_id as spot_owner_id,
      p.first_name,
      p.last_name,
      p.full_name,
      p.avatar_url
    from public.spot_claims sc
    join public.spots s on s.id = sc.spot_id
    join public.profiles p on p.id = sc.claimant_id
    where (
      v_status is null
      or sc.status = v_status
    )
  ),
  total_count as (
    select count(*)::integer as total
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case when status = 'pending' then 0 else 1 end,
      created_at desc
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'spot_id', p.spot_id,
            'claimant_id', p.claimant_id,
            'status', p.status,
            'business_name', p.business_name,
            'contact_name', p.contact_name,
            'contact_email', p.contact_email,
            'contact_phone', p.contact_phone,
            'website', p.website,
            'message', p.message,
            'proof_note', p.proof_note,
            'decision_note', p.decision_note,
            'reviewed_by', p.reviewed_by,
            'reviewed_at', p.reviewed_at,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'spot', jsonb_build_object(
              'id', p.spot_id,
              'name', p.spot_name,
              'slug', p.spot_slug,
              'city', p.spot_city,
              'owner_id', p.spot_owner_id
            ),
            'claimant', jsonb_build_object(
              'id', p.claimant_id,
              'first_name', p.first_name,
              'last_name', p.last_name,
              'full_name', p.full_name,
              'avatar_url', p.avatar_url
            )
          )
          order by
            case when p.status = 'pending' then 0 else 1 end,
            p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
    'limit',
    v_limit,
    'offset',
    v_offset
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 9) RLS aktivieren
-- ----------------------------------------

alter table public.spot_claims enable row level security;

-- Öffentliche Reads: nein
-- Claim-Daten sind sensibel

drop policy if exists "spot_claims_select_own_or_admin" on public.spot_claims;
create policy "spot_claims_select_own_or_admin"
on public.spot_claims
for select
to authenticated
using (
  claimant_id = auth.uid()
  or public.is_admin_v1(auth.uid())
);

drop policy if exists "spot_claims_insert_own" on public.spot_claims;
create policy "spot_claims_insert_own"
on public.spot_claims
for insert
to authenticated
with check (
  claimant_id = auth.uid()
);

drop policy if exists "spot_claims_update_own_pending_or_admin" on public.spot_claims;
create policy "spot_claims_update_own_pending_or_admin"
on public.spot_claims
for update
to authenticated
using (
  (
    claimant_id = auth.uid()
    and status = 'pending'
  )
  or public.is_admin_v1(auth.uid())
)
with check (
  (
    claimant_id = auth.uid()
  )
  or public.is_admin_v1(auth.uid())
);

drop policy if exists "spot_claims_delete_admin_only" on public.spot_claims;
create policy "spot_claims_delete_admin_only"
on public.spot_claims
for delete
to authenticated
using (
  public.is_admin_v1(auth.uid())
);