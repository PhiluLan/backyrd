\set ON_ERROR_STOP on

begin;

create function pg_temp.identity_test_uuid(p_label text) returns uuid
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

create function pg_temp.identity_assert(p_ok boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9.1 Identity Trust acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.identity_set_actor(
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

create function pg_temp.identity_make_user(
  p_label text,
  p_email text,
  p_created_at timestamptz,
  p_confirmed boolean default false
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := pg_temp.identity_test_uuid('identity-user:' || p_label);
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated', p_email, '',
    case when p_confirmed then p_created_at else null end,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, p_created_at, p_created_at, '', '', '', ''
  );
  return v_id;
end;
$$;

do $$
begin
  perform pg_temp.identity_assert(
    (select count(*) = 9
     from public.account_trust_signal_registry
     where dimension = 'identity' and signal_key like 'identity_%'),
    'all nine canonical Identity signals are registered'
  );
  perform pg_temp.identity_assert(
    (select count(*) = 5 from public.account_trust_identity_age_milestones where enabled),
    'all five account-age milestones are configured'
  );
  perform pg_temp.identity_assert(exists(
    select 1 from public.account_trust_identity_detector_config
    where detector_key = 'backyrd.identity.signup_velocity'
      and threshold_count = 3
      and observation_window = interval '30 minutes'
  ), 'signup velocity uses three accounts in thirty minutes');
  perform pg_temp.identity_assert(exists(
    select 1 from public.account_trust_identity_detector_config
    where detector_key = 'backyrd.identity.multiple_registrations'
      and threshold_count = 2
  ), 'multiple-registration detection starts at two accounts');
end;
$$;

-- Email verification: the one canonical auth hook emits once at the first
-- transition to a confirmed email and never on later updates.
do $$
declare
  v_now timestamptz := now();
  v_user uuid := pg_temp.identity_make_user(
    'email-verification', 'email-verification@sprint91.invalid', v_now, false
  );
begin
  perform pg_temp.identity_assert(
    (select count(*) = 0 from public.account_trust_signals
     where user_id = v_user and signal_key = 'identity_email_verified'),
    'unverified email has no supporting signal'
  );

  update auth.users set email_confirmed_at = v_now, updated_at = v_now where id = v_user;
  perform pg_temp.identity_assert(
    (select count(*) = 1 from public.account_trust_signals
     where user_id = v_user and signal_key = 'identity_email_verified'
       and detector_key = 'backyrd.identity.email_verified'
       and detector_version = '1.0.0'
       and confidence = 1 and strength = 1
       and deduplication_key = 'email_verified:v1'),
    'first successful verification emits exactly one versioned signal'
  );

  update auth.users set email_confirmed_at = v_now + interval '1 second' where id = v_user;
  perform public.account_trust_evaluate_identity_user_v1(v_user, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 1 from public.account_trust_signals
     where user_id = v_user and signal_key = 'identity_email_verified'),
    'repeated verification and evaluation remain idempotent'
  );
end;
$$;

-- Account age: test below, exactly at, above, and repeat without waiting.
do $$
declare
  v_now timestamptz := now();
  v_below uuid;
  v_exact uuid;
  v_above uuid;
  v_count integer;
begin
  update public.account_trust_identity_detector_config
  set enabled = false where detector_key = 'backyrd.identity.account_age';
  v_below := pg_temp.identity_make_user(
    'age-below', 'age-below@sprint91.invalid', v_now - interval '6 days 23 hours 59 minutes', false
  );
  v_exact := pg_temp.identity_make_user(
    'age-exact', 'age-exact@sprint91.invalid', v_now - interval '7 days', false
  );
  v_above := pg_temp.identity_make_user(
    'age-above', 'age-above@sprint91.invalid', v_now - interval '366 days', false
  );
  update public.account_trust_identity_detector_config
  set enabled = true where detector_key = 'backyrd.identity.account_age';

  perform public.account_trust_evaluate_identity_user_v1(v_below, v_now);
  perform public.account_trust_evaluate_identity_user_v1(v_exact, v_now);
  perform public.account_trust_evaluate_identity_user_v1(v_above, v_now);

  perform pg_temp.identity_assert(
    (select count(*) = 0 from public.account_trust_signals
     where user_id = v_below and signal_key like 'identity_account_age_%'),
    'account age below seven days does not signal'
  );
  perform pg_temp.identity_assert(
    (select count(*) = 1 from public.account_trust_signals
     where user_id = v_exact and signal_key = 'identity_account_age_7d'),
    'account age signals exactly at the seven-day boundary'
  );
  perform pg_temp.identity_assert(
    (select count(*) = 5 from public.account_trust_signals
     where user_id = v_above and signal_key like 'identity_account_age_%'),
    'old account receives every reached milestone exactly once'
  );

  select count(*) into v_count from public.account_trust_signals
  where user_id = v_above and signal_key like 'identity_account_age_%';
  perform public.account_trust_evaluate_identity_user_v1(v_above, v_now);
  perform public.account_trust_evaluate_identity_due_v1(1000, v_now);
  perform pg_temp.identity_assert(
    (select count(*) from public.account_trust_signals
     where user_id = v_above and signal_key like 'identity_account_age_%') = v_count,
    'milestone evaluation never repeats a signal'
  );
end;
$$;

-- Disposable email registry: exact and subdomain matches are positive;
-- ordinary and disabled entries are negative controls.
do $$
declare
  v_now timestamptz := now();
  v_exact uuid;
  v_subdomain uuid;
  v_normal uuid;
  v_disabled uuid;
begin
  insert into public.account_trust_identity_disposable_email_domains (
    domain, enabled, source, source_version
  ) values ('disabled-disposable.test', false, 'acceptance_fixture', '1');

  v_exact := pg_temp.identity_make_user(
    'disposable-exact', 'person@mailinator.com', v_now, false
  );
  v_subdomain := pg_temp.identity_make_user(
    'disposable-subdomain', 'person@sub.mailinator.com', v_now, false
  );
  v_normal := pg_temp.identity_make_user(
    'disposable-negative', 'person@example.com', v_now, false
  );
  v_disabled := pg_temp.identity_make_user(
    'disposable-disabled', 'person@disabled-disposable.test', v_now, false
  );

  perform pg_temp.identity_assert(
    (select count(*) = 1 from public.account_trust_signals
     where user_id = v_exact and signal_key = 'identity_disposable_email'
       and evidence ->> 'match_type' = 'exact'),
    'enabled disposable domain emits an exact-match signal'
  );
  perform pg_temp.identity_assert(
    (select count(*) = 1 from public.account_trust_signals
     where user_id = v_subdomain and signal_key = 'identity_disposable_email'
       and evidence ->> 'match_type' = 'subdomain'),
    'subdomain boundary matches the configured parent domain'
  );
  perform pg_temp.identity_assert(
    (select count(*) = 0 from public.account_trust_signals
     where user_id in (v_normal, v_disabled) and signal_key = 'identity_disposable_email'),
    'ordinary and disabled domains remain negative controls'
  );
  perform public.account_trust_evaluate_identity_user_v1(v_exact, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 1 from public.account_trust_signals
     where user_id = v_exact and signal_key = 'identity_disposable_email'),
    'disposable-email evaluation is idempotent'
  );
end;
$$;

-- Signup velocity and multiple registration use only a hashed existing,
-- opt-in Analytics installation identifier. Separate installations model
-- shared WiFi/office/university controls and must never correlate accounts.
do $$
declare
  v_now timestamptz := now();
  v_installation uuid := pg_temp.identity_test_uuid('shared-installation');
  v_separate_a uuid := pg_temp.identity_test_uuid('separate-installation-a');
  v_separate_b uuid := pg_temp.identity_test_uuid('separate-installation-b');
  v_one uuid;
  v_two uuid;
  v_three uuid;
  v_four uuid;
  v_control_a uuid;
  v_control_b uuid;
  v_signal_count integer;
  v_enforcement_before integer;
  v_measure_before integer;
  v_event_before integer;
begin
  v_one := pg_temp.identity_make_user(
    'velocity-one', 'velocity-one@example.com', v_now - interval '30 minutes', false
  );
  v_two := pg_temp.identity_make_user(
    'velocity-two', 'velocity-two@example.com', v_now - interval '15 minutes', false
  );
  v_three := pg_temp.identity_make_user(
    'velocity-three', 'velocity-three@example.com', v_now, false
  );
  v_four := pg_temp.identity_make_user(
    'velocity-four', 'velocity-four@example.com', v_now, false
  );
  v_control_a := pg_temp.identity_make_user(
    'shared-network-a', 'shared-network-a@example.com', v_now, false
  );
  v_control_b := pg_temp.identity_make_user(
    'shared-network-b', 'shared-network-b@example.com', v_now, false
  );

  select count(*) into v_enforcement_before from public.safety_account_enforcements;
  select count(*) into v_measure_before from public.safety_account_measures;
  select count(*) into v_event_before from public.safety_user_enforcement_events;

  perform public.account_trust_record_technical_identity_v1(v_one, v_installation, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 0 from public.account_trust_signals
     where user_id = v_one and signal_key in (
       'identity_multiple_registrations', 'identity_signup_velocity'
     )),
    'one registration on a technical identity emits no risk signal'
  );

  perform public.account_trust_record_technical_identity_v1(v_two, v_installation, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 2 from public.account_trust_signals
     where user_id in (v_one, v_two)
       and signal_key = 'identity_multiple_registrations'),
    'exactly two associated accounts emit one multiple-registration signal each'
  );
  perform pg_temp.identity_assert(
    (select count(*) = 0 from public.account_trust_signals
     where user_id in (v_one, v_two) and signal_key = 'identity_signup_velocity'),
    'two registrations remain below the velocity threshold'
  );

  perform public.account_trust_record_technical_identity_v1(v_three, v_installation, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 3 from public.account_trust_signals
     where user_id in (v_one, v_two, v_three)
       and signal_key = 'identity_signup_velocity'),
    'exactly three registrations in thirty minutes meet the velocity threshold'
  );

  perform public.account_trust_record_technical_identity_v1(v_four, v_installation, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 4 from public.account_trust_signals
     where user_id in (v_one, v_two, v_three, v_four)
       and signal_key = 'identity_signup_velocity')
    and (select count(*) = 4 from public.account_trust_signals
     where user_id in (v_one, v_two, v_three, v_four)
       and signal_key = 'identity_multiple_registrations'),
    'above-threshold and many-account evaluation covers each account once'
  );

  select count(*) into v_signal_count
  from public.account_trust_signals
  where user_id in (v_one, v_two, v_three, v_four)
    and signal_key in ('identity_signup_velocity', 'identity_multiple_registrations');
  perform public.account_trust_record_technical_identity_v1(v_four, v_installation, v_now);
  perform pg_temp.identity_assert(
    (select count(*) from public.account_trust_signals
     where user_id in (v_one, v_two, v_three, v_four)
       and signal_key in ('identity_signup_velocity', 'identity_multiple_registrations')) = v_signal_count,
    'repeated technical-identity evaluation is idempotent'
  );

  perform public.account_trust_record_technical_identity_v1(v_control_a, v_separate_a, v_now);
  perform public.account_trust_record_technical_identity_v1(v_control_b, v_separate_b, v_now);
  perform pg_temp.identity_assert(
    (select count(*) = 0 from public.account_trust_signals
     where user_id in (v_control_a, v_control_b)
       and signal_key in ('identity_signup_velocity', 'identity_multiple_registrations')),
    'shared WiFi, office, university, or household context cannot correlate separate installations'
  );
  perform pg_temp.identity_assert(not exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_trust_identity_installation_accounts'
      and column_name in ('installation_id', 'ip', 'ip_address', 'device_id', 'fingerprint')
  ), 'Trust storage contains no raw installation, IP, device, or fingerprint identifier');
  perform pg_temp.identity_assert(
    (select risk_level = 'normal' from public.account_trust_scores where user_id = v_one),
    'combined Identity indicators remain review evidence rather than automatic suspicion'
  );
  perform pg_temp.identity_assert(
    (select count(*) from public.safety_account_enforcements) = v_enforcement_before
    and (select count(*) from public.safety_account_measures) = v_measure_before
    and (select count(*) from public.safety_user_enforcement_events) = v_event_before,
    'Identity detectors never create punishment or enforcement'
  );
end;
$$;

-- Admin and authorization contract.
do $$
declare
  v_now timestamptz := now();
  v_admin uuid := pg_temp.identity_make_user(
    'identity-admin', 'identity-admin@example.com', v_now, false
  );
  v_normal uuid := pg_temp.identity_make_user(
    'identity-normal', 'identity-normal@example.com', v_now, false
  );
  v_target uuid := pg_temp.identity_test_uuid('identity-user:disposable-exact');
  v_detail jsonb;
begin
  update public.profiles set is_admin = true where id = v_admin;
  perform pg_temp.identity_set_actor(v_admin);
  v_detail := public.account_trust_admin_detail_v1(v_target);
  perform pg_temp.identity_assert(
    (v_detail -> 'score' -> 'dimension_scores' ->> 'identity') is not null
    and exists (
      select 1 from jsonb_array_elements(v_detail -> 'signals') s
      where s ->> 'signal_key' = 'identity_disposable_email'
        and s ->> 'detector_version' = '1.0.0'
        and s -> 'evidence' ->> 'matched_domain' = 'mailinator.com'
    ),
    'Admin detail exposes Identity score, evidence, and detector version'
  );

  perform pg_temp.identity_set_actor(v_normal);
  perform pg_temp.identity_assert(
    not has_function_privilege('authenticated',
      'public.account_trust_evaluate_identity_user_v1(uuid,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.account_trust_evaluate_identity_due_v1(integer,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.account_trust_evaluate_technical_identity_v1(text,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.account_trust_record_technical_identity_v1(uuid,uuid,timestamp with time zone)', 'EXECUTE'),
    'normal users cannot fabricate or evaluate Identity signals'
  );
end;
$$;

do $$
begin
  perform pg_temp.identity_assert(not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'account_trust_%' or p.proname = 'handle_new_user')
      and p.prosecdef
      and (
        p.proconfig is null
        or not exists (
          select 1 from unnest(p.proconfig) c where c like 'search_path=%'
        )
      )
  ), 'all Identity SECURITY DEFINER functions have explicit search_path');
  perform pg_temp.identity_assert(not exists(
    select 1
    from (values
      ('account_trust_identity_detector_config'),
      ('account_trust_identity_age_milestones'),
      ('account_trust_identity_disposable_email_domains'),
      ('account_trust_identity_installation_accounts')
    ) t(table_name)
    join pg_class c on c.relname = t.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where not c.relrowsecurity
  ), 'RLS is enabled on all Sprint 9.1 tables');
  perform pg_temp.identity_assert(not exists(
    select 1
    from (values
      ('account_trust_identity_detector_config'),
      ('account_trust_identity_age_milestones'),
      ('account_trust_identity_disposable_email_domains'),
      ('account_trust_identity_installation_accounts')
    ) t(table_name)
    where has_table_privilege('anon', 'public.' || t.table_name, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT,INSERT,UPDATE,DELETE')
  ), 'client roles cannot read or mutate raw Identity detector state');
  perform pg_temp.identity_assert(
    (select count(*) = 1
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth' and c.relname = 'users'
       and not t.tgisinternal and t.tgenabled <> 'D'),
    'auth.users retains exactly one active custom lifecycle trigger'
  );
  perform pg_temp.identity_assert(exists(
    select 1 from cron.job
    where jobname = 'backyrd-account-trust-identity-daily'
      and active
      and schedule = '17 3 * * *'
      and command like '%account_trust_evaluate_identity_due_v1(1000, now())%'
  ), 'age milestones have one secret-free daily canonical job');
end;
$$;

rollback;

\echo 'Sprint 9.1 Identity Trust Signals acceptance passed.'
