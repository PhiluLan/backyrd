\set ON_ERROR_STOP on

begin;

create function pg_temp.account_trust_test_uuid(p_label text) returns uuid
language sql immutable
as $$
  select (
    substr(md5(p_label), 1, 8) || '-' ||
    substr(md5(p_label), 9, 4) || '-4' ||
    substr(md5(p_label), 14, 3) || '-8' ||
    substr(md5(p_label), 18, 3) || '-' ||
    substr(md5(p_label), 21, 12)
  )::uuid;
$$;

create function pg_temp.account_trust_assert(p_ok boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9 Account Trust acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.account_trust_set_actor(
  p_user_id uuid,
  p_role text default 'authenticated'
) returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', p_role)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', p_role, true);
end;
$$;

create function pg_temp.account_trust_set_service() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$$;

create function pg_temp.account_trust_make_user(p_label text) returns uuid
language plpgsql
as $$
declare
  v_id uuid := pg_temp.account_trust_test_uuid('user:' || p_label);
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated', p_label || '@sprint9.invalid', '',
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  );
  return v_id;
end;
$$;

do $$
begin
  perform pg_temp.account_trust_assert(
    (select count(*) = 1
     from public.account_trust_engine_versions where status = 'active'),
    'exactly one engine version is active'
  );
  perform pg_temp.account_trust_assert(
    (select count(*) = 6
     from public.account_trust_dimension_config
     where engine_version = 'account-trust-v1'),
    'all six Account Trust dimensions exist'
  );
  perform pg_temp.account_trust_assert(
    (select abs(sum(weight) - 1) < 0.0001
     from public.account_trust_dimension_config
     where engine_version = 'account-trust-v1'),
    'dimension weights sum to one'
  );
  perform pg_temp.account_trust_assert(
    (select count(*) = 0 from public.account_trust_signal_registry),
    'foundation contains no detector implementations'
  );

  perform pg_temp.account_trust_assert(
    public.account_trust_risk_level_v1(100, 'account-trust-v1') = 'trusted'
    and public.account_trust_risk_level_v1(80, 'account-trust-v1') = 'trusted'
    and public.account_trust_risk_level_v1(79.99, 'account-trust-v1') = 'normal'
    and public.account_trust_risk_level_v1(50, 'account-trust-v1') = 'normal'
    and public.account_trust_risk_level_v1(49.99, 'account-trust-v1') = 'suspicious'
    and public.account_trust_risk_level_v1(25, 'account-trust-v1') = 'suspicious'
    and public.account_trust_risk_level_v1(24.99, 'account-trust-v1') = 'high_risk'
    and public.account_trust_risk_level_v1(0, 'account-trust-v1') = 'high_risk',
    'risk boundaries are exact and exhaustive'
  );
end;
$$;

-- Synthetic definitions validate the engine contract only. They roll back and
-- are not Sprint 9 detector implementations.
insert into public.account_trust_signal_registry (
  signal_key, dimension, polarity, base_score_impact, reason_code,
  definition_version, default_ttl, description
) values
  ('test_identity_support', 'identity', 'supporting', 40, 'TEST_IDENTITY_SUPPORT', 1, null, 'Synthetic identity support.'),
  ('test_behaviour_support', 'behaviour', 'supporting', 40, 'TEST_BEHAVIOUR_SUPPORT', 1, null, 'Synthetic behaviour support.'),
  ('test_network_support', 'network', 'supporting', 40, 'TEST_NETWORK_SUPPORT', 1, null, 'Synthetic network support.'),
  ('test_security_support', 'security', 'supporting', 40, 'TEST_SECURITY_SUPPORT', 1, null, 'Synthetic security support.'),
  ('test_owner_support', 'owner', 'supporting', 40, 'TEST_OWNER_SUPPORT', 1, null, 'Synthetic Owner support.'),
  ('test_reputation_support', 'reputation', 'supporting', 40, 'TEST_REPUTATION_SUPPORT', 1, null, 'Synthetic reputation support.'),
  ('test_network_risk', 'network', 'risk', -100, 'TEST_NETWORK_RISK', 1, null, 'Synthetic network risk.'),
  ('test_expiring_risk', 'security', 'risk', -40, 'TEST_EXPIRING_RISK', 1, interval '1 hour', 'Synthetic expiring risk.');

do $$
declare
  v_user_id uuid := pg_temp.account_trust_make_user('baseline');
  v_risk_user_id uuid := pg_temp.account_trust_make_user('risk');
  v_expiry_user_id uuid := pg_temp.account_trust_make_user('expiry');
  v_result jsonb;
  v_duplicate jsonb;
  v_signal_id uuid;
  v_history_before integer;
  v_enforcement_before integer;
  v_measures_before integer;
  v_events_before integer;
  v_key text;
  i integer := 0;
begin
  perform pg_temp.account_trust_assert(exists(
    select 1 from public.account_trust_scores s
    where s.user_id = v_user_id
      and s.trust_score = 60
      and s.risk_level = 'normal'
      and s.active_signal_count = 0
      and s.reason_codes = '{}'::text[]
      and s.dimension_scores = '{"behaviour":60,"identity":60,"network":60,"owner":60,"reputation":60,"security":60}'::jsonb
  ), 'new account receives the neutral canonical score');
  perform pg_temp.account_trust_assert(
    (select count(*) = 1 from public.account_trust_score_history h
     where h.user_id = v_user_id and h.change_reason = 'account_initialized'),
    'account initialization is audited once'
  );

  select count(*) into v_enforcement_before from public.safety_account_enforcements;
  select count(*) into v_measures_before from public.safety_account_measures;
  select count(*) into v_events_before from public.safety_user_enforcement_events;

  v_result := public.account_trust_emit_signal_v1(
    v_user_id, 'test_identity_support', 'test.identity', '1',
    1, 1, now(), null, 'identity-event-1',
    '{"synthetic":true}'::jsonb, '{"acceptance":"sprint9"}'::jsonb
  );
  perform pg_temp.account_trust_assert(
    (v_result ->> 'trust_score')::numeric = 63.20
    and v_result ->> 'risk_level' = 'normal'
    and (v_result ->> 'active_signal_count')::integer = 1
    and (v_result -> 'dimension_scores' ->> 'identity')::numeric = 100
    and v_result -> 'reason_codes' ? 'TEST_IDENTITY_SUPPORT',
    'single supporting signal is aggregated centrally'
  );
  v_signal_id := (v_result ->> 'signal_id')::uuid;
  v_history_before := (select count(*) from public.account_trust_score_history h where h.user_id = v_user_id);

  v_duplicate := public.account_trust_emit_signal_v1(
    v_user_id, 'test_identity_support', 'test.identity', '1',
    1, 1, now(), null, 'identity-event-1', '{}', '{}'
  );
  perform pg_temp.account_trust_assert(
    (v_duplicate ->> 'duplicate')::boolean
    and (v_duplicate ->> 'signal_id')::uuid = v_signal_id
    and (select count(*) = 1 from public.account_trust_signals s
         where s.user_id = v_user_id and s.deduplication_key = 'identity-event-1')
    and (select count(*) = v_history_before from public.account_trust_score_history h
         where h.user_id = v_user_id),
    'deduplication is idempotent and does not corrupt history'
  );

  foreach v_key in array array[
    'test_behaviour_support', 'test_network_support', 'test_security_support',
    'test_owner_support', 'test_reputation_support'
  ] loop
    i := i + 1;
    v_result := public.account_trust_emit_signal_v1(
      v_user_id, v_key, 'test.support', '1', 1, 1, now(), null,
      'support-event-' || i, '{}', '{}'
    );
  end loop;
  perform pg_temp.account_trust_assert(
    (v_result ->> 'trust_score')::numeric = 100
    and v_result ->> 'risk_level' = 'trusted'
    and (v_result ->> 'active_signal_count')::integer = 6,
    'positive evidence across all dimensions can establish trusted status'
  );

  v_result := public.account_trust_emit_signal_v1(
    v_risk_user_id, 'test_network_risk', 'test.network', '1',
    1, 1, now(), null, 'network-risk-1', '{}', '{}'
  );
  v_signal_id := (v_result ->> 'signal_id')::uuid;
  perform pg_temp.account_trust_assert(
    (v_result ->> 'trust_score')::numeric = 19.20
    and v_result ->> 'risk_level' = 'high_risk'
    and (v_result -> 'dimension_scores' ->> 'network')::numeric = 0
    and v_result -> 'reason_codes' ? 'TEST_NETWORK_RISK',
    'weakest-dimension protection exposes severe network risk'
  );
  perform pg_temp.account_trust_assert(
    (select count(*) = 1 from public.account_trust_signal_events e
     where e.signal_id = v_signal_id and e.event_type = 'emitted'
       and e.actor_type = 'detector'),
    'signal emission has an immutable audit event'
  );

  perform pg_temp.account_trust_set_service();
  v_result := public.account_trust_resolve_signal_v1(
    v_signal_id, 'Synthetic risk disproven', 'resolved'
  );
  perform pg_temp.account_trust_assert(
    (v_result ->> 'trust_score')::numeric = 60
    and v_result ->> 'risk_level' = 'normal'
    and (v_result ->> 'active_signal_count')::integer = 0
    and (select count(*) = 1 from public.account_trust_signal_events e
         where e.signal_id = v_signal_id and e.event_type = 'resolved'),
    'resolving a signal recalculates score and preserves audit'
  );
  v_duplicate := public.account_trust_resolve_signal_v1(
    v_signal_id, 'Repeated resolution', 'resolved'
  );
  perform pg_temp.account_trust_assert(
    (v_duplicate ->> 'duplicate')::boolean
    and (select count(*) = 1 from public.account_trust_signal_events e
         where e.signal_id = v_signal_id and e.event_type = 'resolved'),
    'signal resolution is idempotent'
  );

  v_result := public.account_trust_emit_signal_v1(
    v_expiry_user_id, 'test_expiring_risk', 'test.expiry', '1',
    1, 1, now() - interval '2 hours', null, 'expired-event-1', '{}', '{}'
  );
  perform pg_temp.account_trust_assert(
    (v_result ->> 'trust_score')::numeric = 60
    and v_result ->> 'risk_level' = 'normal'
    and (v_result ->> 'active_signal_count')::integer = 0,
    'expired evidence is retained but excluded from the current aggregate'
  );

  perform pg_temp.account_trust_assert(
    (select count(*) from public.safety_account_enforcements) = v_enforcement_before
    and (select count(*) from public.safety_account_measures) = v_measures_before
    and (select count(*) from public.safety_user_enforcement_events) = v_events_before,
    'Account Trust never creates punishment or enforcement'
  );
end;
$$;

do $$
declare
  v_admin_id uuid := pg_temp.account_trust_make_user('admin');
  v_normal_id uuid := pg_temp.account_trust_make_user('normal-admin-control');
  v_target_id uuid := pg_temp.account_trust_test_uuid('user:risk');
  v_score_before numeric;
  v_history_before integer;
  v_detail jsonb;
  v_note_id uuid;
  v_denied boolean;
begin
  perform pg_temp.account_trust_set_service();
  update public.profiles set is_admin = true where id = v_admin_id;
  perform pg_temp.account_trust_set_actor(v_admin_id);
  perform pg_temp.account_trust_assert(public.safety_is_admin_v1(v_admin_id), 'synthetic Admin is authorized');

  perform pg_temp.account_trust_assert(exists(
    select 1 from public.account_trust_admin_overview_v1(null, 200) o
    where o.user_id = v_target_id and o.trust_score = 60 and o.risk_level = 'normal'
  ), 'Admin overview exposes score, risk and dimensions');

  select trust_score into v_score_before from public.account_trust_scores where user_id = v_target_id;
  select count(*) into v_history_before from public.account_trust_score_history where user_id = v_target_id;
  v_note_id := public.account_trust_admin_add_note_v1(
    v_target_id, 'Synthetic investigation context.', 'investigation'
  );
  v_detail := public.account_trust_admin_detail_v1(v_target_id);
  perform pg_temp.account_trust_assert(
    v_note_id is not null
    and jsonb_array_length(v_detail -> 'signals') >= 1
    and jsonb_array_length(v_detail -> 'score_history') >= 2
    and jsonb_array_length(v_detail -> 'signal_events') >= 2
    and jsonb_array_length(v_detail -> 'notes') = 1,
    'Admin detail exposes signal, score, event and human-note history'
  );
  perform pg_temp.account_trust_assert(
    (select trust_score from public.account_trust_scores where user_id = v_target_id) = v_score_before
    and (select count(*) from public.account_trust_score_history where user_id = v_target_id) = v_history_before,
    'human notes never alter score or score history'
  );

  perform pg_temp.account_trust_set_actor(v_normal_id);
  v_denied := false;
  begin
    perform public.account_trust_admin_overview_v1(null, 1);
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  perform pg_temp.account_trust_assert(v_denied, 'normal users cannot access Admin overview');
  v_denied := false;
  begin
    perform public.account_trust_admin_detail_v1(v_target_id);
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  perform pg_temp.account_trust_assert(v_denied, 'normal users cannot access Account Trust detail');
  v_denied := false;
  begin
    perform public.account_trust_admin_add_note_v1(v_target_id, 'forbidden', 'context');
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  perform pg_temp.account_trust_assert(v_denied, 'normal users cannot add Account Trust notes');
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.account_trust_risk_level_v1(numeric,text)',
    'public.account_trust_recalculate_v1(uuid,uuid,text)',
    'public.account_trust_emit_signal_v1(uuid,text,text,text,numeric,numeric,timestamp with time zone,timestamp with time zone,text,jsonb,jsonb)',
    'public.account_trust_resolve_signal_v1(uuid,text,text)'
  ] loop
    perform pg_temp.account_trust_assert(
      not has_function_privilege('anon', v_function, 'EXECUTE')
      and not has_function_privilege('authenticated', v_function, 'EXECUTE')
      and has_function_privilege('service_role', v_function, 'EXECUTE'),
      'engine helper is service-only: ' || v_function
    );
  end loop;

  foreach v_function in array array[
    'public.account_trust_admin_overview_v1(text,integer)',
    'public.account_trust_admin_detail_v1(uuid)',
    'public.account_trust_admin_add_note_v1(uuid,text,text)'
  ] loop
    perform pg_temp.account_trust_assert(
      not has_function_privilege('anon', v_function, 'EXECUTE')
      and has_function_privilege('authenticated', v_function, 'EXECUTE'),
      'Admin RPC exposure is authenticated with internal Admin checks: ' || v_function
    );
  end loop;

  perform pg_temp.account_trust_assert(not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'account_trust_%'
      and p.prosecdef
      and (
        p.proconfig is null
        or not exists (
          select 1 from unnest(p.proconfig) c where c like 'search_path=%'
        )
      )
  ), 'all Account Trust SECURITY DEFINER functions have explicit search_path');

  perform pg_temp.account_trust_assert(not exists(
    select 1
    from (values
      ('account_trust_engine_versions'), ('account_trust_dimension_config'),
      ('account_trust_signal_registry'), ('account_trust_signals'),
      ('account_trust_scores'), ('account_trust_score_history'),
      ('account_trust_signal_events'), ('account_trust_admin_notes')
    ) t(table_name)
    join pg_class c on c.relname = t.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where not c.relrowsecurity
  ), 'RLS is enabled on every Account Trust table');

  perform pg_temp.account_trust_assert(not exists(
    select 1
    from (values
      ('account_trust_engine_versions'), ('account_trust_dimension_config'),
      ('account_trust_signal_registry'), ('account_trust_signals'),
      ('account_trust_scores'), ('account_trust_score_history'),
      ('account_trust_signal_events'), ('account_trust_admin_notes')
    ) t(table_name)
    where has_table_privilege('anon', 'public.' || t.table_name, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT,UPDATE,DELETE')
  ), 'client roles cannot read raw Trust data or write Trust state directly');
end;
$$;

rollback;

\echo 'Sprint 9 Account Trust Engine acceptance passed.'
