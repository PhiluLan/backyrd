-- Backyrd production reconciliation: missing product contracts and active fixes.
-- Additive and idempotent; never removes application rows.

do $$
begin
  if to_regclass('public.reservations') is not null and exists (
    select 1
    from (
      values
        ('id', 'uuid'),
        ('spot_id', 'uuid'),
        ('user_id', 'uuid'),
        ('date', 'timestamp with time zone')
    ) expected(column_name, data_type)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'reservations'
        and c.column_name = expected.column_name
        and c.data_type = expected.data_type
    )
  ) then
    raise exception 'reservations_exists_with_incompatible_contract';
  end if;
end;
$$;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date timestamptz not null,
  persons integer not null default 2,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_persons_check check (persons between 1 and 50),
  constraint reservations_status_check check (
    status in ('pending', 'confirmed', 'declined', 'cancelled')
  )
);

create index if not exists idx_reservations_spot_id
  on public.reservations (spot_id);
create index if not exists idx_reservations_user_id
  on public.reservations (user_id);
create index if not exists idx_reservations_date
  on public.reservations (date);

drop trigger if exists trg_reservations_set_updated_at on public.reservations;
create trigger trg_reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

alter table public.reservations enable row level security;

drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own on public.reservations
for select to authenticated using (user_id = auth.uid());

drop policy if exists reservations_insert_own on public.reservations;
create policy reservations_insert_own on public.reservations
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists reservations_update_own on public.reservations;
create policy reservations_update_own on public.reservations
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.reservations from public, anon, authenticated;
grant select, insert, update on public.reservations to authenticated;
grant all on public.reservations to service_role;

do $$
declare
  v_relkind "char";
begin
  select c.relkind into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'spot_likes';

  if v_relkind is not null and v_relkind <> 'v' then
    raise exception 'spot_likes_exists_but_is_not_a_view';
  end if;
end;
$$;

create or replace view public.spot_likes
with (security_invoker = true) as
select user_id, spot_id, created_at
from public.favorites;

revoke all on public.spot_likes from public, anon, authenticated;
grant select on public.spot_likes to authenticated;
grant all on public.spot_likes to service_role;

create or replace function public.match_mood_v1(input text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  clean text;
  matched_id bigint;
begin
  clean := lower(trim(input));
  if clean is null or clean = '' then
    return null;
  end if;

  select id into matched_id
  from public.mood_tokens
  where lower(token::text) = clean
  limit 1;

  if matched_id is not null then
    return matched_id;
  end if;

  insert into public.mood_tokens (token, locale, valid)
  values (clean, 'de-CH', true)
  returning id into matched_id;

  return matched_id;
end;
$$;

revoke all on function public.match_mood_v1(text)
  from public, anon, authenticated;
grant execute on function public.match_mood_v1(text) to service_role;

-- Production currently selects the newest shadow policy. Preserve the semantic
-- configuration, not production row IDs, authors, or timestamps.
do $policy_check$
declare
  v_expected jsonb := $policy$
  {
    "actions": {
      "allow": {"lifecycle_status": "live", "requires_human_review": false},
      "limit": {"effect": ["exclude_from_recommendations", "exclude_from_search_boost", "retain_for_audit"], "lifecycle_status": "limited"},
      "remove": {"effect": ["not_publicly_visible", "restore_last_safe_revision", "retain_for_audit"], "lifecycle_status": "removed"},
      "temporary_hide": {"effect": ["not_publicly_visible", "restore_last_safe_revision", "retain_for_appeal"], "lifecycle_status": "hidden"}
    },
    "business_context_exceptions": {
      "allowed_access_rules": ["age_restriction", "private_event", "reservation_required", "dress_code", "capacity_limit", "safety_restriction", "no_pets", "service_area_limit"],
      "not_allowed_access_rules": ["protected_characteristic_exclusion", "segregation", "denial_of_service_based_on_identity", "dehumanizing_admission_rule"]
    },
    "framework": {
      "inspired_by": ["Meta Community Standards", "TikTok Community Guidelines", "YouTube Community Guidelines"],
      "principles": ["context_sensitive", "protected_characteristics", "remove_reduce_inform", "human_review_for_ambiguity", "auditability", "appeals", "shadow_first"]
    },
    "policy_categories": {
      "fraud_and_deception": {"default_action": "limit_or_remove", "severity_default": 3, "shadow_action": "needs_review", "subcategories": ["impersonation", "fake_business_claim", "scam", "misleading_contact_information", "manipulated_reviews"]},
      "harassment_and_bullying": {"default_action": "limit_or_remove", "severity_default": 3, "shadow_action": "needs_review", "subcategories": ["targeted_insult", "degrading_language", "sexual_harassment", "threat", "doxxing", "coordinated_harassment", "unwanted_contact"]},
      "hate_and_discrimination": {"default_action": "remove", "severity_default": 4, "shadow_action": "needs_review", "subcategories": ["protected_group_attack", "discriminatory_exclusion", "dehumanization", "inferiority_claim", "segregation_or_denial_of_service", "hateful_slur", "hateful_ideology_support"]},
      "privacy_and_personal_data": {"default_action": "remove", "severity_default": 4, "shadow_action": "needs_review", "subcategories": ["doxxing", "private_contact_data", "financial_information", "minor_personal_data"]},
      "regulated_and_dangerous_commerce": {"default_action": "remove", "severity_default": 4, "shadow_action": "needs_review", "subcategories": ["illegal_goods", "weapons", "drugs", "fraudulent_services", "human_exploitation"]},
      "self_harm": {"default_action": "remove_and_escalate", "severity_default": 5, "shadow_action": "needs_review", "subcategories": ["promotion", "intent", "instructions", "graphic_depiction"]},
      "sexual_safety": {"default_action": "remove", "severity_default": 4, "shadow_action": "needs_review", "subcategories": ["sexual_exploitation", "non_consent", "sexual_services", "sexual_content_in_business_profile", "minor_safety"]},
      "violence_and_incitement": {"default_action": "remove", "severity_default": 5, "shadow_action": "needs_review", "subcategories": ["credible_threat", "incitement", "glorification", "instructions_for_harm"]}
    },
    "policy_id": "backyrd-global",
    "protected_characteristics": ["race", "ethnicity", "national_origin", "nationality", "religion", "caste", "tribe", "immigration_status", "sex", "gender", "gender_identity", "sexual_orientation", "disability", "serious_disease", "age"],
    "status": "shadow",
    "version": "2026-07-29.2"
  }
  $policy$::jsonb;
  v_existing public.safety_policy_versions%rowtype;
begin
  select * into v_existing
  from public.safety_policy_versions
  where policy_key = 'backyrd-global' and version = '2026-07-29.2';

  if found and (v_existing.status <> 'shadow' or v_existing.policy <> v_expected) then
    raise exception 'safety_policy_2026_07_29_2_differs_from_reviewed_configuration';
  end if;

  if not found then
    insert into public.safety_policy_versions (
      policy_key, version, status, policy, activated_at
    ) values (
      'backyrd-global', '2026-07-29.2', 'shadow', v_expected, now()
    );
  end if;
end;
$policy_check$;

-- Fix the active review auto-link path without changing its matching behavior.
create or replace function public.link_decision_review_v1(
  p_review_id uuid,
  p_decision_id uuid default null,
  p_source_context jsonb default '{}'::jsonb
)
returns table(
  linked boolean,
  decision_id uuid,
  match_type text,
  signal_strength numeric,
  hours_between numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review record;
  v_candidate record;
  v_candidate_found boolean := false;
  v_match_type text := 'auto_recent_same_spot';
  v_signal numeric := 0.92;
  v_hours numeric := null;
begin
  select r.id, r.user_id, r.spot_id, r.created_at
  into v_review
  from public.reviews r
  where r.id = p_review_id and r.user_id = auth.uid();

  if not found then
    return query
      select false, null::uuid, 'review_not_found_or_not_owned'::text,
             0::numeric, null::numeric;
    return;
  end if;

  if p_decision_id is not null then
    select
      s.id as decision_id,
      s.created_at as decision_created_at,
      di.rank,
      di.why_this,
      (
        select a.action
        from public.decision_actions a
        where a.decision_id = s.id and a.spot_id = v_review.spot_id
        order by a.created_at desc
        limit 1
      ) as last_action
    into v_candidate
    from public.decision_sessions s
    join public.decision_impressions di
      on di.decision_id = s.id and di.spot_id = v_review.spot_id
    where s.id = p_decision_id and s.user_id = v_review.user_id
    limit 1;

    v_candidate_found := found;
    if v_candidate_found then
      v_match_type := 'explicit_decision_review';
      v_signal := 1.45;
      v_hours := extract(epoch from (
        v_review.created_at - v_candidate.decision_created_at
      )) / 3600.0;
    end if;
  end if;

  if not v_candidate_found then
    select
      s.id as decision_id,
      s.created_at as decision_created_at,
      di.rank,
      di.why_this,
      (
        select a.action
        from public.decision_actions a
        where a.decision_id = s.id and a.spot_id = v_review.spot_id
        order by a.created_at desc
        limit 1
      ) as last_action
    into v_candidate
    from public.decision_sessions s
    join public.decision_impressions di
      on di.decision_id = s.id and di.spot_id = v_review.spot_id
    where s.user_id = v_review.user_id
      and s.created_at <= v_review.created_at
      and s.created_at >= v_review.created_at - interval '12 hours'
    order by
      case
        when exists (
          select 1 from public.decision_actions a
          where a.decision_id = s.id
            and a.spot_id = v_review.spot_id
            and a.action in ('was_here', 'exact_mood')
        ) then 5
        when exists (
          select 1 from public.decision_actions a
          where a.decision_id = s.id
            and a.spot_id = v_review.spot_id
            and a.action = 'tapped'
        ) then 4
        else 2
      end desc,
      di.rank asc,
      s.created_at desc
    limit 1;

    v_candidate_found := found;
    if v_candidate_found then
      v_match_type := 'auto_recent_same_spot';
      v_signal := case
        when v_candidate.last_action in ('was_here', 'exact_mood') then 1.25
        when v_candidate.last_action = 'tapped' then 1.10
        else 0.92
      end;
      v_hours := extract(epoch from (
        v_review.created_at - v_candidate.decision_created_at
      )) / 3600.0;
    end if;
  end if;

  if not v_candidate_found then
    return query
      select false, null::uuid, 'no_recent_decision_match'::text,
             0::numeric, null::numeric;
    return;
  end if;

  insert into public.backyrd_decision_review_links_v1 (
    user_id, decision_id, review_id, spot_id, match_type, signal_strength,
    decision_created_at, review_created_at, hours_between, context
  ) values (
    v_review.user_id,
    v_candidate.decision_id,
    v_review.id,
    v_review.spot_id,
    v_match_type,
    v_signal,
    v_candidate.decision_created_at,
    v_review.created_at,
    v_hours,
    coalesce(p_source_context, '{}'::jsonb) || jsonb_build_object(
      'decision_rank', v_candidate.rank,
      'decision_why_this', v_candidate.why_this,
      'decision_last_action', v_candidate.last_action,
      'linked_by', 'link_decision_review_v1'
    )
  )
  on conflict (review_id) do update set
    decision_id = excluded.decision_id,
    spot_id = excluded.spot_id,
    match_type = excluded.match_type,
    signal_strength = greatest(
      public.backyrd_decision_review_links_v1.signal_strength,
      excluded.signal_strength
    ),
    decision_created_at = excluded.decision_created_at,
    review_created_at = excluded.review_created_at,
    hours_between = excluded.hours_between,
    context = public.backyrd_decision_review_links_v1.context || excluded.context;

  update public.social_posts sp
  set
    source_type = 'decision_review',
    source_context = coalesce(sp.source_context, '{}'::jsonb)
      || coalesce(p_source_context, '{}'::jsonb)
      || jsonb_build_object(
        'decision_id', v_candidate.decision_id,
        'decision_rank', v_candidate.rank,
        'decision_match_type', v_match_type,
        'decision_signal_strength', v_signal,
        'hours_between_decision_and_review', v_hours
      )
  where sp.review_id = v_review.id;

  return query
    select true, v_candidate.decision_id, v_match_type, v_signal, v_hours;
end;
$$;

revoke all on function public.link_decision_review_v1(uuid, uuid, jsonb)
  from public;
grant execute on function public.link_decision_review_v1(uuid, uuid, jsonb)
  to authenticated, service_role;
