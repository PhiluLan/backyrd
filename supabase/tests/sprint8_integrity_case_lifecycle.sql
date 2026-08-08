\set ON_ERROR_STOP on

begin;

do $$
declare
  v_policy_id uuid;
  v_content_id uuid;
  v_case_id uuid;
  v_raised_case_id uuid;
  v_review_id uuid;
  v_spot_id uuid;
  v_signal_count integer;
  v_event_count integer;
  v_admin_id uuid := '10000000-0000-4000-8000-000000000001';
begin
  select id
  into v_policy_id
  from public.safety_policy_versions
  where policy_key = 'backyrd-global'
    and status in ('shadow', 'active')
  order by activated_at desc nulls last, created_at desc
  limit 1;

  if v_policy_id is null then
    raise exception 'test_policy_missing';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_admin_id,
    'authenticated',
    'authenticated',
    'sprint8-admin@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  update public.profiles
  set is_admin = true
  where id = v_admin_id;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_id,
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- A: clean Content Safety with no Integrity keeps the existing auto-allow.
  insert into public.safety_content_items (
    content_type, entity_type, entity_id, text_content
  ) values (
    'review', 'review', gen_random_uuid(), 'clean-a'
  ) returning id into v_content_id;

  insert into public.safety_cases (
    content_item_id, policy_version_id, case_status, priority,
    decision_source
  ) values (
    v_content_id, v_policy_id, 'evaluating', 20, 'automated_shadow'
  ) returning id into v_case_id;

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_shadow'
  where id = v_case_id;

  if (select case_status from public.safety_cases where id = v_case_id)
    <> 'decided'
  then
    raise exception 'A_clean_auto_allow_changed';
  end if;

  -- G: the canonical Integrity raiser reopens the same automatically decided
  -- case when the Integrity dimension completes after clean Content Safety.
  insert into public.spots (name, lat, lng, status)
  values ('Sprint 8 synthetic spot', 47.3769, 8.5417, 'approved')
  returning id into v_spot_id;

  insert into public.reviews (spot_id, text)
  values (v_spot_id, 'Synthetic review for lifecycle validation.')
  returning id into v_review_id;

  select c.id
  into v_case_id
  from public.safety_cases c
  join public.safety_content_items i on i.id = c.content_item_id
  where i.entity_type = 'review'
    and i.entity_id = v_review_id
  order by c.created_at desc
  limit 1;

  if v_case_id is null then
    raise exception 'G_review_case_not_registered';
  end if;

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      final_severity = 0,
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_shadow'
  where id = v_case_id;

  select raised.case_id
  into v_raised_case_id
  from public.safety_raise_review_integrity_signal_v1(
    v_review_id,
    'review_integrity_exact_duplicate',
    'suspicious',
    0.78,
    '{"previous_exact_duplicates":1}'::jsonb,
    '{"test":"integrity_after_content_safety"}'::jsonb
  ) raised;

  if v_raised_case_id is distinct from v_case_id
    or not exists (
      select 1
      from public.safety_cases c
      where c.id = v_case_id
        and c.case_status = 'needs_review'
        and c.priority >= 60
        and c.final_action is null
        and c.explanation_code = 'REVIEW_INTEGRITY_SIGNAL'
    )
  then
    raise exception 'G_integrity_did_not_reopen_automated_case';
  end if;

  if not exists (
    select 1
    from public.safety_admin_queue_v3('needs_review', 200) q
    where q.case_id = v_case_id
      and q.has_integrity_signal
      and q.integrity_signal_count >= 1
      and q.integrity_risk_level = 'suspicious'
      and q.integrity_score = 0.78
  ) then
    raise exception 'G_admin_queue_does_not_expose_integrity_contract';
  end if;

  if jsonb_array_length(
    public.safety_admin_case_detail_v1(v_case_id) -> 'signals'
  ) < 1 then
    raise exception 'G_admin_detail_does_not_expose_integrity_signal';
  end if;

  -- B/C/F/H/J: Integrity first, then repeated clean text/image completion.
  insert into public.safety_content_items (
    content_type, entity_type, entity_id, text_content
  ) values (
    'review', 'review', gen_random_uuid(), 'integrity-first'
  ) returning id into v_content_id;

  insert into public.safety_cases (
    content_item_id, policy_version_id, case_status, priority,
    decision_source, explanation_code
  ) values (
    v_content_id, v_policy_id, 'evaluating', 20,
    'automated_shadow', 'TEXT_EVALUATION_QUEUED'
  ) returning id into v_case_id;

  insert into public.safety_signals (
    case_id, signal_type, provider, categories, scores, flagged
  ) values (
    v_case_id,
    'review_integrity_exact_duplicate',
    'backyrd_integrity',
    '{"risk_level":"suspicious","previous_exact_duplicates":1}'::jsonb,
    '{"integrity_score":0.78}'::jsonb,
    true
  );

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'needs_review'
      and priority >= 60
  ) then
    raise exception 'B_F_integrity_did_not_require_review';
  end if;

  insert into public.safety_signals (
    case_id, signal_type, provider, categories, scores, flagged
  ) values (
    v_case_id, 'specialized_moderation', 'openai', '{}', '{}', false
  );

  insert into public.safety_decision_events (
    case_id, action, category, severity, confidence, source,
    reason_codes, metadata
  ) values (
    v_case_id, 'allow', 'none', 0, 0.01, 'automated_shadow',
    array['NO_POLICY_VIOLATION', 'SHADOW_MODE'],
    '{"evaluation_source":"automatic_text_queue_v1"}'::jsonb
  );

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      final_severity = 0,
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_shadow'
  where id = v_case_id;

  -- Repeated text completion and an image completion use the same guarded path.
  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_shadow'
  where id = v_case_id;

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_policy'
  where id = v_case_id;

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'needs_review'
      and explanation_code = 'TEXT_EVALUATION_QUEUED'
  ) then
    raise exception 'F_H_J_automated_completion_closed_integrity_case';
  end if;

  select count(*) into v_signal_count
  from public.safety_signals where case_id = v_case_id;
  select count(*) into v_event_count
  from public.safety_decision_events where case_id = v_case_id;

  if v_signal_count <> 2 or v_event_count <> 1 then
    raise exception 'F_audit_history_missing';
  end if;

  -- C: high-risk Integrity raises priority to at least 80.
  insert into public.safety_signals (
    case_id, signal_type, provider, categories, scores, flagged
  ) values (
    v_case_id,
    'review_integrity_coordinated_copy',
    'backyrd_integrity',
    '{"risk_level":"high_risk"}'::jsonb,
    '{"integrity_score":0.93}'::jsonb,
    true
  );

  if (select priority from public.safety_cases where id = v_case_id) < 80 then
    raise exception 'C_high_risk_priority_not_preserved';
  end if;

  -- T2/I: the same original-race case can be resolved by a human Admin.
  perform public.safety_admin_decide_user_content_v1(
    v_case_id,
    'allow',
    null,
    null,
    null,
    'Synthetic Sprint 8 original-race resolution.',
    'Integrity and Content Safety dimensions reviewed by a synthetic Admin.',
    array['HUMAN_REVIEW', 'REVIEW_INTEGRITY_HUMAN_REVIEW']
  );

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'decided'
      and decision_source = 'human'
      and decided_by = v_admin_id
  ) then
    raise exception 'I_original_race_human_resolution_failed';
  end if;

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'remove',
      final_category = 'none',
      decision_source = 'automated_policy',
      decided_by = null,
      decided_at = null
  where id = v_case_id;

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and final_action = 'allow'
      and decision_source = 'human'
      and decided_by = v_admin_id
  ) then
    raise exception 'J_original_race_late_worker_overwrote_human_resolution';
  end if;

  -- D/E/reverse race: a Content Safety review requirement survives a later
  -- benign automated result, with or without an Integrity signal.
  insert into public.safety_content_items (
    content_type, entity_type, entity_id, text_content
  ) values (
    'review', 'review', gen_random_uuid(), 'content-safety-first'
  ) returning id into v_content_id;

  insert into public.safety_cases (
    content_item_id, policy_version_id, case_status, priority,
    final_action, final_category, final_severity, decision_source,
    explanation_code
  ) values (
    v_content_id, v_policy_id, 'needs_review', 70,
    'allow_log', 'harassment', 3, 'automated_shadow',
    'PRIMARY_HARASSMENT'
  ) returning id into v_case_id;

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      final_severity = 0,
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_shadow'
  where id = v_case_id;

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'needs_review'
      and final_category = 'harassment'
      and explanation_code = 'PRIMARY_HARASSMENT'
  ) then
    raise exception 'D_reverse_race_cleared_content_safety_review';
  end if;

  insert into public.safety_signals (
    case_id, signal_type, provider, categories, scores, flagged
  ) values (
    v_case_id,
    'review_integrity_near_duplicate',
    'backyrd_integrity',
    '{"risk_level":"suspicious"}'::jsonb,
    '{"integrity_score":0.74}'::jsonb,
    true
  );

  update public.safety_cases
  set case_status = 'decided',
      final_action = 'allow',
      final_category = 'none',
      explanation_code = 'NO_POLICY_VIOLATION',
      decision_source = 'automated_shadow'
  where id = v_case_id;

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'needs_review'
      and final_category = 'harassment'
  ) then
    raise exception 'E_combined_review_requirement_cleared';
  end if;

  -- I: a legitimate human Admin can resolve all blocking dimensions.
  perform public.safety_admin_decide_user_content_v1(
    v_case_id,
    'allow',
    null,
    null,
    null,
    'Synthetic Sprint 8 lifecycle validation.',
    'All automated dimensions reviewed by a synthetic Admin.',
    array['HUMAN_REVIEW', 'REVIEW_INTEGRITY_HUMAN_REVIEW']
  );

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'decided'
      and decision_source = 'human'
      and decided_by = v_admin_id
  ) then
    raise exception 'I_human_admin_could_not_resolve_case';
  end if;

  -- A late worker cannot overwrite the completed human decision.
  update public.safety_cases
  set case_status = 'decided',
      final_action = 'remove',
      final_category = 'none',
      decision_source = 'automated_policy',
      decided_by = null,
      decided_at = null
  where id = v_case_id;

  if not exists (
    select 1 from public.safety_cases
    where id = v_case_id
      and case_status = 'decided'
      and final_action = 'allow'
      and decision_source = 'human'
      and decided_by = v_admin_id
  ) then
    raise exception 'J_late_worker_overwrote_human_resolution';
  end if;
end;
$$;

rollback;

\echo 'Sprint 8 integrity case lifecycle matrix passed.'
