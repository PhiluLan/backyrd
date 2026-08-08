-- Sprint 8.5: keep independent automated safety dimensions from resolving
-- a case that still requires accountable human review.

create or replace function public.safety_case_requires_human_review_v1(
  p_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select
      case
        when c.case_status in ('decided', 'closed')
          and c.decision_source in ('human', 'human_admin', 'appeal_human')
          and c.decided_by is not null
          then false
        else
          c.case_status = 'needs_review'
          or exists (
            select 1
            from public.safety_signals s
            where s.case_id = c.id
              and s.flagged is true
          )
      end
    from public.safety_cases c
    where c.id = p_case_id
  ), false);
$$;

revoke all on function public.safety_case_requires_human_review_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.safety_case_requires_human_review_v1(uuid)
  to service_role;

create or replace function public.safety_preserve_human_review_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_human_resolution boolean;
  v_was_human_resolution boolean;
begin
  v_is_human_resolution :=
    new.case_status in ('decided', 'closed')
    and new.decision_source in ('human', 'human_admin', 'appeal_human')
    and new.decided_by is not null;

  if v_is_human_resolution then
    return new;
  end if;

  v_was_human_resolution :=
    old.case_status in ('decided', 'closed')
    and old.decision_source in ('human', 'human_admin', 'appeal_human')
    and old.decided_by is not null;

  -- A late/repeated worker must never overwrite a completed human decision.
  if v_was_human_resolution then
    return old;
  end if;

  if new.case_status is distinct from 'needs_review'
    and public.safety_case_requires_human_review_v1(old.id)
  then
    new.case_status := 'needs_review';
    new.priority := greatest(old.priority, new.priority);
    new.final_action := old.final_action;
    new.final_category := old.final_category;
    new.final_severity := old.final_severity;
    new.final_confidence := old.final_confidence;
    new.decision_source := old.decision_source;
    new.explanation_code := old.explanation_code;
    new.explanation_public := old.explanation_public;
    new.explanation_internal := old.explanation_internal;
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;

  return new;
end;
$$;

revoke all on function public.safety_preserve_human_review_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_safety_preserve_human_review_v1
  on public.safety_cases;

create trigger trg_safety_preserve_human_review_v1
before update on public.safety_cases
for each row
execute function public.safety_preserve_human_review_v1();

create or replace function public.safety_sync_flagged_signal_case_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_integrity_priority integer;
begin
  if new.flagged is not true then
    return new;
  end if;

  v_integrity_priority :=
    case
      when new.provider = 'backyrd_integrity'
        or new.signal_type like 'review_integrity_%'
      then case
        when new.categories ->> 'risk_level' = 'high_risk' then 80
        else 60
      end
      else 0
    end;

  update public.safety_cases c
  set
    case_status = 'needs_review',
    priority = greatest(c.priority, v_integrity_priority),
    updated_at = now()
  where c.id = new.case_id
    and not (
      c.case_status in ('decided', 'closed')
      and c.decision_source in ('human', 'human_admin', 'appeal_human')
      and c.decided_by is not null
    );

  return new;
end;
$$;

revoke all on function public.safety_sync_flagged_signal_case_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_safety_sync_flagged_signal_case_v1
  on public.safety_signals;

create trigger trg_safety_sync_flagged_signal_case_v1
after insert or update of flagged, provider, signal_type, categories
on public.safety_signals
for each row
execute function public.safety_sync_flagged_signal_case_v1();

create or replace function public.safety_raise_review_integrity_signal_v1(
  p_review_id uuid,
  p_signal_type text,
  p_risk_level text,
  p_integrity_score numeric default null,
  p_categories jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  case_id uuid,
  signal_id uuid,
  case_status text,
  priority integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_content_item_id uuid;
  v_case_id uuid;
  v_signal_id uuid;
  v_policy_version_id uuid;
  v_priority integer;
  v_existing_signal_id uuid;
  v_reopen_automated_case boolean := false;
begin
  if p_review_id is null then
    raise exception 'review_id_required';
  end if;

  if nullif(trim(coalesce(p_signal_type, '')), '') is null then
    raise exception 'signal_type_required';
  end if;

  if p_signal_type not like 'review_integrity_%' then
    raise exception 'invalid_review_integrity_signal_type';
  end if;

  if p_risk_level not in ('suspicious', 'high_risk') then
    raise exception 'invalid_review_integrity_risk_level';
  end if;

  if not exists (
    select 1
    from public.reviews r
    where r.id = p_review_id
  ) then
    raise exception 'review_not_found';
  end if;

  select ci.id
  into v_content_item_id
  from public.safety_content_items ci
  where ci.content_type = 'review'
    and ci.entity_type = 'review'
    and ci.entity_id = p_review_id
  limit 1;

  if v_content_item_id is null then
    raise exception 'review_not_registered_in_safety_registry';
  end if;

  v_priority := case p_risk_level
    when 'high_risk' then 80
    else 60
  end;

  select c.id
  into v_case_id
  from public.safety_cases c
  where c.content_item_id = v_content_item_id
    and c.case_status in ('queued', 'evaluating', 'needs_review')
  order by c.created_at desc
  limit 1
  for update;

  -- If clean automated moderation finished first, the integrity dimension
  -- belongs to the same aggregate case. Human decisions are never reopened.
  if v_case_id is null then
    select c.id
    into v_case_id
    from public.safety_cases c
    where c.content_item_id = v_content_item_id
      and c.case_status = 'decided'
      and c.decision_source in ('automated_shadow', 'automated_policy')
      and c.decided_by is null
    order by c.updated_at desc, c.created_at desc
    limit 1
    for update;

    v_reopen_automated_case := v_case_id is not null;
  end if;

  if v_case_id is null then
    select pv.id
    into v_policy_version_id
    from public.safety_policy_versions pv
    where pv.policy_key = 'backyrd-global'
      and pv.status in ('shadow', 'active')
    order by pv.activated_at desc nulls last, pv.created_at desc
    limit 1;

    if v_policy_version_id is null then
      raise exception 'active_or_shadow_safety_policy_missing';
    end if;

    insert into public.safety_cases (
      content_item_id,
      policy_version_id,
      case_status,
      priority,
      final_action,
      decision_source,
      explanation_code,
      explanation_internal
    )
    values (
      v_content_item_id,
      v_policy_version_id,
      'needs_review',
      v_priority,
      null,
      'automated_shadow',
      'REVIEW_INTEGRITY_SIGNAL',
      'Review authenticity or manipulation signal requires human review.'
    )
    returning id into v_case_id;
  elsif v_reopen_automated_case then
    update public.safety_cases c
    set
      case_status = 'needs_review',
      priority = greatest(c.priority, v_priority),
      final_action = null,
      final_category = null,
      final_severity = null,
      final_confidence = null,
      explanation_code = 'REVIEW_INTEGRITY_SIGNAL',
      explanation_public = null,
      explanation_internal =
        'Review authenticity or manipulation signal requires human review.',
      decided_by = null,
      decided_at = null,
      updated_at = now()
    where c.id = v_case_id;
  else
    update public.safety_cases c
    set
      case_status = 'needs_review',
      priority = greatest(c.priority, v_priority),
      updated_at = now()
    where c.id = v_case_id;
  end if;

  select s.id
  into v_existing_signal_id
  from public.safety_signals s
  where s.case_id = v_case_id
    and s.signal_type = p_signal_type
    and s.provider = 'backyrd_integrity'
    and s.raw_response ->> 'review_id' = p_review_id::text
  order by s.created_at desc
  limit 1;

  if v_existing_signal_id is not null then
    v_signal_id := v_existing_signal_id;
  else
    insert into public.safety_signals (
      case_id,
      signal_type,
      provider,
      model,
      model_version,
      categories,
      scores,
      flagged,
      raw_response,
      latency_ms,
      error_code
    )
    values (
      v_case_id,
      p_signal_type,
      'backyrd_integrity',
      'deterministic_rules',
      'review-integrity-v1',
      coalesce(p_categories, '{}'::jsonb)
        || jsonb_build_object('risk_level', p_risk_level),
      jsonb_build_object('integrity_score', p_integrity_score),
      true,
      coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'review_id', p_review_id,
          'risk_level', p_risk_level,
          'integrity_version', 'v1'
        ),
      null,
      null
    )
    returning id into v_signal_id;
  end if;

  return query
  select c.id, v_signal_id, c.case_status, c.priority
  from public.safety_cases c
  where c.id = v_case_id;
end;
$$;

revoke all on function public.safety_raise_review_integrity_signal_v1(
  uuid, text, text, numeric, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.safety_raise_review_integrity_signal_v1(
  uuid, text, text, numeric, jsonb, jsonb
) to service_role;
