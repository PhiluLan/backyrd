\set ON_ERROR_STOP on

begin;

create function pg_temp.founder_test_uuid(p_label text) returns uuid
language sql immutable
as $$
  select (
    substr(md5(p_label), 1, 8) || '-' || substr(md5(p_label), 9, 4) || '-4' ||
    substr(md5(p_label), 14, 3) || '-8' || substr(md5(p_label), 18, 3) || '-' ||
    substr(md5(p_label), 21, 12)
  )::uuid;
$$;

create function pg_temp.founder_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Founder Control Center V1 acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.founder_set_actor(p_user_id uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', p_role, true);
end;
$$;

create function pg_temp.founder_make_user(p_label text, p_admin boolean default false)
returns uuid language plpgsql as $$
declare v_id uuid := pg_temp.founder_test_uuid(p_label);
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_label || '@founder-test.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );
  if p_admin then
    update public.profiles set is_admin = true where id = v_id;
    insert into public.admin_users(user_id, role) values (v_id, 'super_admin');
  end if;
  return v_id;
end;
$$;

do $$
declare
  v_admin uuid := pg_temp.founder_make_user('founder-admin', true);
  v_normal uuid := pg_temp.founder_make_user('founder-normal', false);
  v_readiness jsonb;
  v_kpis jsonb;
  v_history_before bigint;
  v_enforcements_before bigint;
  v_measures_before bigint;
  v_denied boolean := false;
begin
  perform pg_temp.founder_assert(
    (select sum(weight) = 100 from public.founder_launch_categories),
    'category weights total exactly 100 percent'
  );
  perform pg_temp.founder_assert(
    (select count(*) = 9 from public.founder_launch_categories),
    'all nine weighted launch categories exist'
  );
  perform pg_temp.founder_assert(
    not exists (
      select 1 from public.founder_launch_categories c
      left join lateral (
        select sum(g.contribution_weight) total
        from public.founder_launch_gates g where g.category_key = c.category_key
      ) x on true
      where abs(coalesce(x.total, 0) - 1) > 0.000001
    ),
    'gate contribution weights total one inside every category'
  );

  perform pg_temp.founder_set_actor(v_normal);
  begin
    perform public.founder_launch_overview_v1();
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.founder_assert(v_denied, 'ordinary authenticated users are denied Founder RPCs');

  perform pg_temp.founder_set_actor(v_admin);
  v_readiness := public.founder_calculate_launch_readiness_v1();
  perform pg_temp.founder_assert(
    v_readiness ->> 'launch_status' = 'BLOCKED'
      and (v_readiness ->> 'p0_remaining')::integer > 0,
    'any unresolved P0 forces launch BLOCKED'
  );
  perform pg_temp.founder_assert(
    (v_readiness ->> 'readiness_percent')::numeric between 0 and 100,
    'weighted readiness stays within percentage bounds'
  );

  select count(*) into v_history_before from public.founder_launch_readiness_history;
  perform public.founder_update_launch_gate_v1('dependency_risk', 'in_progress');
  perform public.founder_update_launch_gate_v1('dependency_risk', 'verify');

  begin
    perform public.founder_update_launch_gate_v1(
      'dependency_risk', 'verified', '[]'::jsonb, 'Attempt without evidence'
    );
    raise exception 'expected evidence validation failure';
  exception when check_violation then
    null;
  end;

  perform public.founder_update_launch_gate_v1(
    'dependency_risk', 'verified',
    '[{"type":"test","ref":"founder_control_center_v1","note":"Deterministic acceptance evidence."}]'::jsonb,
    'Acceptance evidence reviewed in isolated test transaction.'
  );
  perform pg_temp.founder_assert(
    (select count(*) >= v_history_before + 3 from public.founder_launch_readiness_history),
    'each meaningful status change records a readiness snapshot'
  );
  perform pg_temp.founder_assert(
    (select verification_date is not null from public.founder_launch_gates where gate_key = 'dependency_risk'),
    'verified gates receive a verification timestamp'
  );

  begin
    perform public.founder_update_launch_gate_v1('dependency_risk', 'open');
    raise exception 'expected invalid transition failure';
  exception when invalid_parameter_value then
    null;
  end;

  set local session_replication_role = replica;
  update public.founder_launch_gates
  set status = 'verified',
      evidence = case when jsonb_array_length(evidence) = 0
        then '[{"type":"test","ref":"p0-override","note":"Synthetic transaction-only evidence."}]'::jsonb
        else evidence end,
      verification_note = coalesce(verification_note, 'Synthetic transaction-only verification.'),
      verification_date = coalesce(verification_date, now());
  set local session_replication_role = origin;
  v_readiness := public.founder_calculate_launch_readiness_v1();
  perform pg_temp.founder_assert(
    v_readiness ->> 'launch_status' = 'GO'
      and (v_readiness ->> 'readiness_percent')::numeric = 100,
    'fully verified register reaches 100 percent and GO'
  );

  set local session_replication_role = replica;
  update public.founder_launch_gates
  set status = 'open', verification_date = null
  where gate_key = 'ai_cost_abuse_protection';
  set local session_replication_role = origin;
  v_readiness := public.founder_calculate_launch_readiness_v1();
  perform pg_temp.founder_assert(
    v_readiness ->> 'launch_status' = 'BLOCKED'
      and (v_readiness ->> 'readiness_percent')::numeric > 90,
    'P0 override blocks launch even when the numerical score is high'
  );

  v_kpis := public.founder_core_kpis_v1(now());
  perform pg_temp.founder_assert(
    v_kpis ?& array['wau', 'mau', 'decisions_week', 'basel_launch_ready_spots', 'open_trust_alerts', 'decision_success']
      and v_kpis -> 'decision_success' ->> 'status' = 'data_not_ready',
    'Founder KPI response is complete and refuses to fabricate Decision Success'
  );

  select count(*) into v_enforcements_before from public.safety_account_enforcements;
  select count(*) into v_measures_before from public.safety_account_measures;
  perform public.founder_launch_overview_v1();
  perform pg_temp.founder_assert(
    (select count(*) from public.safety_account_enforcements) = v_enforcements_before
      and (select count(*) from public.safety_account_measures) = v_measures_before,
    'Founder reads and launch-gate updates create no product or enforcement side effects'
  );
end;
$$;

rollback;
