-- Backyrd Sprint 9: canonical Account Trust Engine.
--
-- This migration creates the shared signal -> aggregation -> score -> audit
-- contract. It intentionally contains no signup-abuse, bot, rate-limit,
-- sockpuppet, takeover or Owner-abuse detectors, and it performs no
-- enforcement or distribution changes.

create table public.account_trust_engine_versions (
  version text primary key,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  baseline_score numeric(5,2) not null
    check (baseline_score between 0 and 100),
  weighted_average_share numeric(5,4) not null
    check (weighted_average_share between 0 and 1),
  weakest_dimension_share numeric(5,4) not null
    check (weakest_dimension_share between 0 and 1),
  trusted_min_score numeric(5,2) not null,
  normal_min_score numeric(5,2) not null,
  suspicious_min_score numeric(5,2) not null,
  description text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  check (weighted_average_share + weakest_dimension_share = 1),
  check (
    trusted_min_score between 0 and 100
    and normal_min_score between 0 and trusted_min_score
    and suspicious_min_score between 0 and normal_min_score
  ),
  check (
    (status = 'active' and activated_at is not null and retired_at is null)
    or status = 'draft'
    or (status = 'retired' and retired_at is not null)
  )
);

create unique index account_trust_engine_one_active_idx
  on public.account_trust_engine_versions ((status))
  where status = 'active';

create table public.account_trust_dimension_config (
  engine_version text not null references public.account_trust_engine_versions(version),
  dimension text not null
    check (dimension in (
      'identity', 'behaviour', 'network', 'security', 'owner', 'reputation'
    )),
  weight numeric(5,4) not null check (weight > 0 and weight <= 1),
  description text not null,
  primary key (engine_version, dimension)
);

create table public.account_trust_signal_registry (
  signal_key text primary key
    check (signal_key ~ '^[a-z][a-z0-9_]*$'),
  dimension text not null
    check (dimension in (
      'identity', 'behaviour', 'network', 'security', 'owner', 'reputation'
    )),
  polarity text not null check (polarity in ('supporting', 'risk')),
  base_score_impact numeric(6,2) not null
    check (base_score_impact between -100 and 100 and base_score_impact <> 0),
  reason_code text not null unique
    check (reason_code ~ '^[A-Z][A-Z0-9_]*$'),
  definition_version integer not null default 1 check (definition_version > 0),
  default_ttl interval,
  enabled boolean not null default true,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (polarity = 'supporting' and base_score_impact > 0)
    or (polarity = 'risk' and base_score_impact < 0)
  ),
  check (default_ttl is null or default_ttl > interval '0 seconds'),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.account_trust_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signal_key text not null references public.account_trust_signal_registry(signal_key),
  dimension text not null
    check (dimension in (
      'identity', 'behaviour', 'network', 'security', 'owner', 'reputation'
    )),
  polarity text not null check (polarity in ('supporting', 'risk')),
  score_impact numeric(6,2) not null check (score_impact between -100 and 100),
  reason_code text not null,
  definition_version integer not null check (definition_version > 0),
  detector_key text not null check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  strength numeric(5,4) not null default 1 check (strength between 0 and 1),
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  status text not null default 'active'
    check (status in ('active', 'resolved', 'revoked', 'expired')),
  deduplication_key text,
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  expires_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_trust_signals_detector_event_key
    unique (user_id, signal_key, detector_key, deduplication_key),
  check (jsonb_typeof(evidence) = 'object'),
  check (jsonb_typeof(metadata) = 'object'),
  check (expires_at is null or expires_at > observed_at),
  check (
    (status = 'active' and resolved_at is null and resolution_reason is null)
    or (status <> 'active' and resolved_at is not null and resolution_reason is not null)
  ),
  check (
    (polarity = 'supporting' and score_impact > 0)
    or (polarity = 'risk' and score_impact < 0)
  )
);

create index account_trust_signals_user_active_idx
  on public.account_trust_signals (user_id, observed_at desc)
  where status = 'active';
create index account_trust_signals_expiry_idx
  on public.account_trust_signals (expires_at)
  where status = 'active' and expires_at is not null;
create index account_trust_signals_dimension_idx
  on public.account_trust_signals (user_id, dimension, observed_at desc);

create table public.account_trust_scores (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  engine_version text not null references public.account_trust_engine_versions(version),
  trust_score numeric(5,2) not null check (trust_score between 0 and 100),
  risk_level text not null
    check (risk_level in ('trusted', 'normal', 'suspicious', 'high_risk')),
  dimension_scores jsonb not null,
  reason_codes text[] not null default '{}'::text[],
  active_signal_count integer not null default 0 check (active_signal_count >= 0),
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(dimension_scores) = 'object')
);

create index account_trust_scores_risk_idx
  on public.account_trust_scores (risk_level, trust_score, updated_at desc);

create table public.account_trust_score_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  engine_version text not null references public.account_trust_engine_versions(version),
  previous_score numeric(5,2),
  trust_score numeric(5,2) not null check (trust_score between 0 and 100),
  previous_risk_level text,
  risk_level text not null
    check (risk_level in ('trusted', 'normal', 'suspicious', 'high_risk')),
  dimension_scores jsonb not null,
  reason_codes text[] not null default '{}'::text[],
  active_signal_count integer not null check (active_signal_count >= 0),
  trigger_signal_id uuid references public.account_trust_signals(id) on delete set null,
  change_reason text not null,
  created_at timestamptz not null default now(),
  check (previous_score is null or previous_score between 0 and 100),
  check (
    previous_risk_level is null
    or previous_risk_level in ('trusted', 'normal', 'suspicious', 'high_risk')
  ),
  check (jsonb_typeof(dimension_scores) = 'object')
);

create index account_trust_score_history_user_idx
  on public.account_trust_score_history (user_id, created_at desc, id desc);

create table public.account_trust_signal_events (
  id bigint generated always as identity primary key,
  signal_id uuid not null references public.account_trust_signals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('emitted', 'resolved', 'revoked', 'expired')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_type text not null
    check (actor_type in ('detector', 'admin', 'system')),
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index account_trust_signal_events_signal_idx
  on public.account_trust_signal_events (signal_id, created_at desc, id desc);
create index account_trust_signal_events_user_idx
  on public.account_trust_signal_events (user_id, created_at desc, id desc);

create table public.account_trust_admin_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_user_id uuid references public.profiles(id) on delete set null,
  note text not null check (length(btrim(note)) between 1 and 4000),
  note_type text not null default 'context'
    check (note_type in ('context', 'investigation', 'correction')),
  created_at timestamptz not null default now()
);

create index account_trust_admin_notes_user_idx
  on public.account_trust_admin_notes (user_id, created_at desc);

comment on table public.account_trust_signal_registry is
  'Canonical registry for future Account Trust detector outputs; definitions are versioned and contain no detector execution logic.';
comment on table public.account_trust_signals is
  'Immutable-at-emission Account Trust signal snapshots. Signals are evidence, never proof or enforcement.';
comment on table public.account_trust_scores is
  'Current canonical Account Trust score and risk level. This table has no enforcement or distribution side effects.';
comment on table public.account_trust_score_history is
  'Append-only Account Trust score history written when the aggregate contract changes.';
comment on table public.account_trust_admin_notes is
  'Human context for Account Trust investigations. Notes never alter scores.';

insert into public.account_trust_engine_versions (
  version, status, baseline_score, weighted_average_share,
  weakest_dimension_share, trusted_min_score, normal_min_score,
  suspicious_min_score, description, activated_at
) values (
  'account-trust-v1', 'active', 60, 0.40, 0.60, 80, 50, 25,
  'Sprint 9 canonical Account Trust aggregation contract.', now()
);

insert into public.account_trust_dimension_config (
  engine_version, dimension, weight, description
) values
  ('account-trust-v1', 'identity', 0.20, 'Likelihood that the account represents a real person.'),
  ('account-trust-v1', 'behaviour', 0.20, 'Consistency with genuine Backyrd product behaviour.'),
  ('account-trust-v1', 'network', 0.20, 'Evidence of artificial coordination or account networks.'),
  ('account-trust-v1', 'security', 0.15, 'Evidence that the account is currently secure or compromised.'),
  ('account-trust-v1', 'owner', 0.10, 'Legitimacy of Owner and business-management behaviour.'),
  ('account-trust-v1', 'reputation', 0.15, 'Positive long-term contribution and reliability evidence.');

create or replace function public.account_trust_risk_level_v1(
  p_score numeric,
  p_engine_version text default null
) returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config public.account_trust_engine_versions%rowtype;
begin
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'account_trust_score_out_of_range' using errcode = '22023';
  end if;

  select * into v_config
  from public.account_trust_engine_versions v
  where (
    (p_engine_version is null and v.status = 'active')
    or v.version = p_engine_version
  )
  order by (v.status = 'active') desc, v.activated_at desc nulls last
  limit 1;

  if v_config.version is null then
    raise exception 'account_trust_engine_version_not_found' using errcode = 'P0002';
  end if;

  return case
    when p_score >= v_config.trusted_min_score then 'trusted'
    when p_score >= v_config.normal_min_score then 'normal'
    when p_score >= v_config.suspicious_min_score then 'suspicious'
    else 'high_risk'
  end;
end;
$$;

create or replace function public.account_trust_recalculate_v1(
  p_user_id uuid,
  p_trigger_signal_id uuid default null,
  p_change_reason text default 'recalculated'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config public.account_trust_engine_versions%rowtype;
  v_previous public.account_trust_scores%rowtype;
  v_dimension_scores jsonb;
  v_weighted_score numeric;
  v_weakest_score numeric;
  v_score numeric(5,2);
  v_risk_level text;
  v_reason_codes text[] := '{}'::text[];
  v_signal_count integer := 0;
  v_changed boolean;
begin
  if p_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_user_id
  ) then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(p_change_reason, '')), '') is null then
    raise exception 'account_trust_change_reason_required' using errcode = '22023';
  end if;

  select * into v_config
  from public.account_trust_engine_versions v
  where v.status = 'active'
  order by v.activated_at desc
  limit 1;

  if v_config.version is null then
    raise exception 'active_account_trust_engine_missing';
  end if;

  if (select count(*) from public.account_trust_dimension_config d
      where d.engine_version = v_config.version) <> 6
     or abs((select sum(d.weight) from public.account_trust_dimension_config d
             where d.engine_version = v_config.version) - 1) > 0.0001 then
    raise exception 'account_trust_dimension_config_invalid';
  end if;

  select
    jsonb_object_agg(x.dimension, x.dimension_score order by x.dimension),
    sum(x.dimension_score * x.weight),
    min(x.dimension_score)
  into v_dimension_scores, v_weighted_score, v_weakest_score
  from (
    select
      d.dimension,
      d.weight,
      round(greatest(0, least(100,
        v_config.baseline_score + coalesce(sum(
          s.score_impact * s.strength * s.confidence
        ) filter (
          where s.status = 'active'
            and (s.expires_at is null or s.expires_at > now())
        ), 0)
      )), 2) as dimension_score
    from public.account_trust_dimension_config d
    left join public.account_trust_signals s
      on s.user_id = p_user_id
     and s.dimension = d.dimension
    where d.engine_version = v_config.version
    group by d.dimension, d.weight
  ) x;

  v_score := round(greatest(0, least(100,
    v_weighted_score * v_config.weighted_average_share
    + v_weakest_score * v_config.weakest_dimension_share
  )), 2);
  v_risk_level := public.account_trust_risk_level_v1(v_score, v_config.version);

  select count(*)::integer into v_signal_count
  from public.account_trust_signals s
  where s.user_id = p_user_id
    and s.status = 'active'
    and (s.expires_at is null or s.expires_at > now());

  select coalesce(array_agg(r.reason_code order by r.contribution desc, r.observed_at desc), '{}'::text[])
  into v_reason_codes
  from (
    select distinct on (s.reason_code)
      s.reason_code,
      abs(s.score_impact * s.strength * s.confidence) as contribution,
      s.observed_at
    from public.account_trust_signals s
    where s.user_id = p_user_id
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > now())
    order by s.reason_code, contribution desc, s.observed_at desc
  ) r;

  select * into v_previous
  from public.account_trust_scores s
  where s.user_id = p_user_id
  for update;

  v_changed := v_previous.user_id is null
    or v_previous.engine_version is distinct from v_config.version
    or v_previous.trust_score is distinct from v_score
    or v_previous.risk_level is distinct from v_risk_level
    or v_previous.dimension_scores is distinct from v_dimension_scores
    or v_previous.reason_codes is distinct from v_reason_codes
    or v_previous.active_signal_count is distinct from v_signal_count;

  insert into public.account_trust_scores (
    user_id, engine_version, trust_score, risk_level, dimension_scores,
    reason_codes, active_signal_count, computed_at, updated_at
  ) values (
    p_user_id, v_config.version, v_score, v_risk_level, v_dimension_scores,
    v_reason_codes, v_signal_count, now(), now()
  )
  on conflict (user_id) do update set
    engine_version = excluded.engine_version,
    trust_score = excluded.trust_score,
    risk_level = excluded.risk_level,
    dimension_scores = excluded.dimension_scores,
    reason_codes = excluded.reason_codes,
    active_signal_count = excluded.active_signal_count,
    computed_at = excluded.computed_at,
    updated_at = excluded.updated_at;

  if v_changed then
    insert into public.account_trust_score_history (
      user_id, engine_version, previous_score, trust_score,
      previous_risk_level, risk_level, dimension_scores, reason_codes,
      active_signal_count, trigger_signal_id, change_reason
    ) values (
      p_user_id, v_config.version, v_previous.trust_score, v_score,
      v_previous.risk_level, v_risk_level, v_dimension_scores, v_reason_codes,
      v_signal_count, p_trigger_signal_id, btrim(p_change_reason)
    );
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'engine_version', v_config.version,
    'trust_score', v_score,
    'risk_level', v_risk_level,
    'dimension_scores', v_dimension_scores,
    'reason_codes', to_jsonb(v_reason_codes),
    'active_signal_count', v_signal_count,
    'changed', v_changed
  );
end;
$$;

create or replace function public.account_trust_emit_signal_v1(
  p_user_id uuid,
  p_signal_key text,
  p_detector_key text,
  p_detector_version text,
  p_strength numeric default 1,
  p_confidence numeric default 1,
  p_observed_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_deduplication_key text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_definition public.account_trust_signal_registry%rowtype;
  v_signal_id uuid;
  v_effective_expiry timestamptz;
  v_result jsonb;
  v_duplicate boolean := false;
begin
  if p_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_user_id
  ) then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;
  if p_strength is null or p_strength < 0 or p_strength > 1 then
    raise exception 'account_trust_strength_out_of_range' using errcode = '22023';
  end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'account_trust_confidence_out_of_range' using errcode = '22023';
  end if;
  if p_observed_at is null or p_observed_at > now() + interval '5 minutes' then
    raise exception 'account_trust_observed_at_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_detector_key, '')), '') is null
     or p_detector_key !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception 'account_trust_detector_key_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_detector_version, '')), '') is null then
    raise exception 'account_trust_detector_version_required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'account_trust_json_object_required' using errcode = '22023';
  end if;

  select * into v_definition
  from public.account_trust_signal_registry r
  where r.signal_key = p_signal_key
    and r.enabled = true;

  if v_definition.signal_key is null then
    raise exception 'account_trust_signal_definition_not_found' using errcode = 'P0002';
  end if;

  v_effective_expiry := coalesce(
    p_expires_at,
    case when v_definition.default_ttl is null then null
         else p_observed_at + v_definition.default_ttl end
  );
  if v_effective_expiry is not null and v_effective_expiry <= p_observed_at then
    raise exception 'account_trust_expiry_invalid' using errcode = '22023';
  end if;

  insert into public.account_trust_signals (
    user_id, signal_key, dimension, polarity, score_impact, reason_code,
    definition_version, detector_key, detector_version, strength, confidence,
    deduplication_key, evidence, metadata, observed_at, expires_at
  ) values (
    p_user_id, v_definition.signal_key, v_definition.dimension,
    v_definition.polarity, v_definition.base_score_impact,
    v_definition.reason_code, v_definition.definition_version,
    p_detector_key, btrim(p_detector_version), p_strength, p_confidence,
    nullif(btrim(coalesce(p_deduplication_key, '')), ''),
    coalesce(p_evidence, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb),
    p_observed_at, v_effective_expiry
  )
  on conflict (user_id, signal_key, detector_key, deduplication_key)
  do nothing
  returning id into v_signal_id;

  if v_signal_id is null then
    select s.id into v_signal_id
    from public.account_trust_signals s
    where s.user_id = p_user_id
      and s.signal_key = p_signal_key
      and s.detector_key = p_detector_key
      and s.deduplication_key = nullif(btrim(coalesce(p_deduplication_key, '')), '')
    limit 1;
    v_duplicate := true;
  else
    insert into public.account_trust_signal_events (
      signal_id, user_id, event_type, actor_type, reason_code, metadata
    ) values (
      v_signal_id, p_user_id, 'emitted', 'detector',
      v_definition.reason_code,
      jsonb_build_object(
        'detector_key', p_detector_key,
        'detector_version', btrim(p_detector_version),
        'definition_version', v_definition.definition_version
      )
    );
  end if;

  if not v_duplicate then
    v_result := public.account_trust_recalculate_v1(
      p_user_id, v_signal_id, 'signal_emitted:' || p_signal_key
    );
  else
    select jsonb_build_object(
      'user_id', s.user_id,
      'engine_version', s.engine_version,
      'trust_score', s.trust_score,
      'risk_level', s.risk_level,
      'dimension_scores', s.dimension_scores,
      'reason_codes', to_jsonb(s.reason_codes),
      'active_signal_count', s.active_signal_count,
      'changed', false
    ) into v_result
    from public.account_trust_scores s
    where s.user_id = p_user_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'signal_id', v_signal_id,
    'duplicate', v_duplicate
  );
end;
$$;

create or replace function public.account_trust_resolve_signal_v1(
  p_signal_id uuid,
  p_resolution_reason text,
  p_status text default 'resolved'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_signal public.account_trust_signals%rowtype;
  v_actor_type text := 'system';
  v_actor_id uuid := auth.uid();
  v_result jsonb;
begin
  if p_status not in ('resolved', 'revoked', 'expired') then
    raise exception 'account_trust_resolution_status_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_resolution_reason, '')), '') is null then
    raise exception 'account_trust_resolution_reason_required' using errcode = '22023';
  end if;

  select * into v_signal
  from public.account_trust_signals s
  where s.id = p_signal_id
  for update;
  if v_signal.id is null then
    raise exception 'account_trust_signal_not_found' using errcode = 'P0002';
  end if;

  if v_signal.status <> 'active' then
    select to_jsonb(s) into v_result
    from public.account_trust_scores s where s.user_id = v_signal.user_id;
    return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'signal_id', v_signal.id, 'duplicate', true
    );
  end if;

  if v_actor_id is not null then
    if not public.safety_is_admin_v1(v_actor_id) then
      raise exception 'admin_access_required' using errcode = '42501';
    end if;
    v_actor_type := 'admin';
  end if;

  update public.account_trust_signals
  set status = p_status,
      resolved_at = now(),
      resolution_reason = btrim(p_resolution_reason),
      updated_at = now()
  where id = p_signal_id;

  insert into public.account_trust_signal_events (
    signal_id, user_id, event_type, actor_user_id, actor_type,
    reason_code, metadata
  ) values (
    v_signal.id, v_signal.user_id, p_status, v_actor_id, v_actor_type,
    'ACCOUNT_TRUST_SIGNAL_' || upper(p_status),
    jsonb_build_object('resolution_reason', btrim(p_resolution_reason))
  );

  return public.account_trust_recalculate_v1(
    v_signal.user_id, v_signal.id, 'signal_' || p_status
  ) || jsonb_build_object('signal_id', v_signal.id, 'duplicate', false);
end;
$$;

create or replace function public.account_trust_initialize_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.account_trust_recalculate_v1(
    new.id, null, 'account_initialized'
  );
  return new;
end;
$$;

create or replace function public.account_trust_admin_overview_v1(
  p_risk_level text default null,
  p_limit integer default 200
) returns table (
  user_id uuid,
  display_name text,
  username text,
  trust_score numeric,
  risk_level text,
  dimension_scores jsonb,
  reason_codes text[],
  active_signal_count integer,
  computed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null or not public.safety_is_admin_v1(auth.uid()) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_risk_level is not null
     and p_risk_level not in ('trusted', 'normal', 'suspicious', 'high_risk') then
    raise exception 'account_trust_risk_filter_invalid' using errcode = '22023';
  end if;

  return query
  select
    p.id,
    coalesce(p.display_name, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, p.id::text),
    p.username,
    s.trust_score,
    s.risk_level,
    s.dimension_scores,
    s.reason_codes,
    s.active_signal_count,
    s.computed_at
  from public.account_trust_scores s
  join public.profiles p on p.id = s.user_id
  where p_risk_level is null or s.risk_level = p_risk_level
  order by s.trust_score asc, s.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

create or replace function public.account_trust_admin_detail_v1(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.safety_is_admin_v1(auth.uid()) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'account', jsonb_build_object(
      'user_id', p.id,
      'display_name', coalesce(p.display_name, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, p.id::text),
      'username', p.username,
      'created_at', p.created_at
    ),
    'score', to_jsonb(s),
    'signals', coalesce((
      select jsonb_agg(to_jsonb(sig) order by sig.observed_at desc, sig.created_at desc)
      from public.account_trust_signals sig where sig.user_id = p.id
    ), '[]'::jsonb),
    'score_history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.created_at desc, h.id desc)
      from public.account_trust_score_history h where h.user_id = p.id
    ), '[]'::jsonb),
    'signal_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc)
      from public.account_trust_signal_events e where e.user_id = p.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(
        to_jsonb(n) || jsonb_build_object(
          'author_name', coalesce(a.display_name, a.username, a.id::text, 'Deleted Admin')
        ) order by n.created_at desc
      )
      from public.account_trust_admin_notes n
      left join public.profiles a on a.id = n.author_user_id
      where n.user_id = p.id
    ), '[]'::jsonb)
  ) into v_result
  from public.profiles p
  left join public.account_trust_scores s on s.user_id = p.id
  where p.id = p_user_id;

  if v_result is null then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.account_trust_admin_add_note_v1(
  p_user_id uuid,
  p_note text,
  p_note_type text default 'context'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_note_id uuid;
begin
  if auth.uid() is null or not public.safety_is_admin_v1(auth.uid()) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;
  if p_note_type not in ('context', 'investigation', 'correction') then
    raise exception 'account_trust_note_type_invalid' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note, ''))) not between 1 and 4000 then
    raise exception 'account_trust_note_invalid' using errcode = '22023';
  end if;

  insert into public.account_trust_admin_notes (
    user_id, author_user_id, note, note_type
  ) values (
    p_user_id, auth.uid(), btrim(p_note), p_note_type
  ) returning id into v_note_id;
  return v_note_id;
end;
$$;

-- Existing accounts receive the neutral canonical snapshot. The operation is
-- set-based, idempotent and restart-safe if a deployment transaction retries.
insert into public.account_trust_scores (
  user_id, engine_version, trust_score, risk_level, dimension_scores,
  reason_codes, active_signal_count
)
select
  p.id,
  'account-trust-v1',
  60,
  'normal',
  '{"behaviour":60,"identity":60,"network":60,"owner":60,"reputation":60,"security":60}'::jsonb,
  '{}'::text[],
  0
from public.profiles p
on conflict (user_id) do nothing;

insert into public.account_trust_score_history (
  user_id, engine_version, previous_score, trust_score,
  previous_risk_level, risk_level, dimension_scores, reason_codes,
  active_signal_count, change_reason
)
select
  s.user_id, s.engine_version, null, s.trust_score,
  null, s.risk_level, s.dimension_scores, s.reason_codes,
  s.active_signal_count, 'account_initialized'
from public.account_trust_scores s
where not exists (
  select 1 from public.account_trust_score_history h
  where h.user_id = s.user_id
);

create trigger trg_account_trust_initialize_profile_v1
after insert on public.profiles
for each row execute function public.account_trust_initialize_profile_v1();

alter table public.account_trust_engine_versions enable row level security;
alter table public.account_trust_dimension_config enable row level security;
alter table public.account_trust_signal_registry enable row level security;
alter table public.account_trust_signals enable row level security;
alter table public.account_trust_scores enable row level security;
alter table public.account_trust_score_history enable row level security;
alter table public.account_trust_signal_events enable row level security;
alter table public.account_trust_admin_notes enable row level security;

revoke all on table public.account_trust_engine_versions from public, anon, authenticated;
revoke all on table public.account_trust_dimension_config from public, anon, authenticated;
revoke all on table public.account_trust_signal_registry from public, anon, authenticated;
revoke all on table public.account_trust_signals from public, anon, authenticated;
revoke all on table public.account_trust_scores from public, anon, authenticated;
revoke all on table public.account_trust_score_history from public, anon, authenticated;
revoke all on table public.account_trust_signal_events from public, anon, authenticated;
revoke all on table public.account_trust_admin_notes from public, anon, authenticated;

grant select, insert, update, delete on table public.account_trust_engine_versions to service_role;
grant select, insert, update, delete on table public.account_trust_dimension_config to service_role;
grant select, insert, update, delete on table public.account_trust_signal_registry to service_role;
grant select, insert, update, delete on table public.account_trust_signals to service_role;
grant select, insert, update, delete on table public.account_trust_scores to service_role;
grant select, insert on table public.account_trust_score_history to service_role;
grant select, insert on table public.account_trust_signal_events to service_role;
grant select, insert on table public.account_trust_admin_notes to service_role;
grant usage, select on sequence public.account_trust_score_history_id_seq
  to service_role;
grant usage, select on sequence public.account_trust_signal_events_id_seq
  to service_role;

revoke all on function public.account_trust_risk_level_v1(numeric, text)
  from public, anon, authenticated;
revoke all on function public.account_trust_recalculate_v1(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.account_trust_emit_signal_v1(
  uuid, text, text, text, numeric, numeric, timestamptz, timestamptz,
  text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.account_trust_resolve_signal_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.account_trust_initialize_profile_v1()
  from public, anon, authenticated, service_role;

grant execute on function public.account_trust_risk_level_v1(numeric, text)
  to service_role;
grant execute on function public.account_trust_recalculate_v1(uuid, uuid, text)
  to service_role;
grant execute on function public.account_trust_emit_signal_v1(
  uuid, text, text, text, numeric, numeric, timestamptz, timestamptz,
  text, jsonb, jsonb
) to service_role;
grant execute on function public.account_trust_resolve_signal_v1(uuid, text, text)
  to service_role;

revoke all on function public.account_trust_admin_overview_v1(text, integer)
  from public, anon;
revoke all on function public.account_trust_admin_detail_v1(uuid)
  from public, anon;
revoke all on function public.account_trust_admin_add_note_v1(uuid, text, text)
  from public, anon;
grant execute on function public.account_trust_admin_overview_v1(text, integer)
  to authenticated, service_role;
grant execute on function public.account_trust_admin_detail_v1(uuid)
  to authenticated, service_role;
grant execute on function public.account_trust_admin_add_note_v1(uuid, text, text)
  to authenticated, service_role;

comment on function public.account_trust_emit_signal_v1(
  uuid, text, text, text, numeric, numeric, timestamptz, timestamptz,
  text, jsonb, jsonb
) is 'Canonical detector boundary for Account Trust. Emits evidence and recalculates trust; never enforces or changes distribution.';
comment on function public.account_trust_admin_add_note_v1(uuid, text, text)
  is 'Adds human context without changing Account Trust score or risk.';
