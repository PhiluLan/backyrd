\set ON_ERROR_STOP on

begin;

create function pg_temp.security_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.security_assert(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9.4 Security Trust acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.security_make_user(
  p_label text,p_created_at timestamptz,p_consent boolean default true
) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.security_uuid('security-user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@sprint94.invalid','',p_created_at,
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
    p_created_at,p_created_at,'','','',''
  );
  if p_consent then
    insert into public.user_consents(user_id,purpose_key,status,granted_at,source,updated_at)
    values(v_id,'optional_product_analytics','granted',p_created_at,'system_migration',p_created_at);
  end if;
  return v_id;
end;
$$;

create function pg_temp.security_add_installation(
  p_user_id uuid,p_label text,p_platform text,p_os_version text,p_observed_at timestamptz
) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.security_uuid('security-installation:'||p_label);
begin
  insert into public.analytics_installations(
    installation_id,user_id,platform,os_version,first_seen_at,last_seen_at,properties
  ) values(v_id,p_user_id,p_platform,p_os_version,p_observed_at,p_observed_at,'{}'::jsonb);
  perform public.account_trust_record_technical_identity_v1(p_user_id,v_id,p_observed_at);
  return v_id;
end;
$$;

create function pg_temp.security_add_event(
  p_user_id uuid,p_event_type text,p_label text,p_occurred_at timestamptz,
  p_change_kind text default null,p_context_label text default null
) returns uuid language plpgsql as $$
declare v_context_hash text;
begin
  if p_context_label is not null then
    v_context_hash:=public.account_trust_security_hash_context_v1(p_context_label);
  end if;
  return public.account_trust_record_security_event_v1(
    p_user_id,p_event_type,'trusted_auth_adapter',p_label,p_occurred_at,v_context_hash,p_change_kind
  );
end;
$$;

create function pg_temp.security_set_actor(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

insert into public.consent_purposes(
  key,title_de,description_de,category,legal_basis,requires_consent,
  is_required,default_enabled,sort_order,is_active
) values('optional_product_analytics','Optionale Produktanalyse',
  'Synthetische Sprint-9.4-Fixture.','analytics','consent',true,false,false,100,true)
on conflict(key) do nothing;

create temporary table security_side_effect_baseline as
select
  (select count(*) from public.safety_account_enforcements) enforcements,
  (select count(*) from public.safety_account_measures) measures,
  (select count(*) from public.safety_user_enforcement_events) user_events,
  (select count(*) from public.safety_enforcement_events) enforcement_events,
  (select count(*) from public.ranking_config) ranking_rows;

do $$
begin
  perform pg_temp.security_assert((select count(*)=8
    from public.account_trust_signal_registry where dimension='security' and signal_key like 'security_%'),
    'all eight Security signals are registered');
  perform pg_temp.security_assert((select count(*)=8
    from public.account_trust_security_detector_config where enabled and detector_version='1.0.0'),
    'all eight Security detectors are versioned and enabled');
end;
$$;

-- New device: one known installation is below, the second is exactly at the
-- threshold, and a third remains above. Established history halves strength.
do $$
declare
  v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_count integer;
begin
  v_below:=pg_temp.security_make_user('device-below',v_now-interval '200 days');
  v_at:=pg_temp.security_make_user('device-at',v_now-interval '200 days');
  v_above:=pg_temp.security_make_user('device-above',v_now-interval '200 days');
  perform pg_temp.security_add_installation(v_below,'device-below-1','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_at,'device-at-1','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_at,'device-at-2','ios','17.6',v_now-interval '1 hour');
  perform pg_temp.security_add_installation(v_above,'device-above-1','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_above,'device-above-2','ios','17.6',v_now-interval '2 hours');
  perform pg_temp.security_add_installation(v_above,'device-above-3','ios','17.6',v_now-interval '1 hour');
  perform public.account_trust_evaluate_security_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform public.account_trust_evaluate_security_user_v1(v_above,v_now);
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='security_new_device'),'first known device is below threshold');
  perform pg_temp.security_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_at and signal_key='security_new_device' and strength=0.15),
    'second device meets threshold with positive-history reduction');
  perform pg_temp.security_assert((select count(*)=2 from public.account_trust_signals
    where user_id=v_above and signal_key='security_new_device'),'third device remains above threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='security';
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform pg_temp.security_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='security')=v_count,'new-device evaluation is idempotent');
end;
$$;

-- New coarse environment: platform + OS major only. No city, country, device
-- model, browser signature, or user agent participates.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_count integer;
begin
  v_below:=pg_temp.security_make_user('environment-below',v_now-interval '200 days');
  v_at:=pg_temp.security_make_user('environment-at',v_now-interval '200 days');
  v_above:=pg_temp.security_make_user('environment-above',v_now-interval '200 days');
  perform pg_temp.security_add_installation(v_below,'environment-below-1','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_at,'environment-at-1','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_at,'environment-at-2','android','14.2',v_now-interval '1 hour');
  perform pg_temp.security_add_installation(v_above,'environment-above-1','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_above,'environment-above-2','android','14.2',v_now-interval '2 hours');
  perform pg_temp.security_add_installation(v_above,'environment-above-3','web','1',v_now-interval '1 hour');
  perform public.account_trust_evaluate_security_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform public.account_trust_evaluate_security_user_v1(v_above,v_now);
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='security_new_environment'),'first environment is below threshold');
  perform pg_temp.security_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_at and signal_key='security_new_environment'),'second environment meets threshold');
  perform pg_temp.security_assert((select count(*)=2 from public.account_trust_signals
    where user_id=v_above and signal_key='security_new_environment'),'third environment remains above threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='security';
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform pg_temp.security_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='security')=v_count,'environment evaluation is idempotent');
end;
$$;

-- Unusual authenticated session pattern: both volume and distinct contexts are
-- required. Seven sessions are below, eight across four contexts are exact.
do $$
declare
  v_now timestamptz:=now();v_user uuid;v_install uuid;v_scenario integer;v_i integer;
  v_below uuid:=pg_temp.security_make_user('login-pattern-below',v_now-interval '200 days');
  v_at uuid:=pg_temp.security_make_user('login-pattern-at',v_now-interval '200 days');
  v_above uuid:=pg_temp.security_make_user('login-pattern-above',v_now-interval '200 days');v_count integer;
begin
  for v_scenario in 1..3 loop
    v_user:=case v_scenario when 1 then v_below when 2 then v_at else v_above end;
    for v_i in 1..(case v_scenario when 1 then 7 when 2 then 8 else 9 end) loop
      v_install:=pg_temp.security_uuid('security-installation:login-'||v_scenario||'-'||
        (((v_i-1) % (case when v_scenario=3 then 5 else 4 end))+1));
      insert into public.analytics_installations(
        installation_id,user_id,platform,os_version,first_seen_at,last_seen_at,properties
      ) values(v_install,v_user,'ios','17.6',v_now-interval '30 days',v_now,'{}'::jsonb)
      on conflict(installation_id) do nothing;
      insert into public.analytics_sessions(user_id,installation_id,platform,started_at,last_seen_at,properties)
      values(v_user,v_install,'ios',v_now-make_interval(mins=>v_i*20),v_now-make_interval(mins=>v_i*20),'{}'::jsonb);
    end loop;
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='security_unusual_login_pattern'),'seven sessions remain below threshold');
  perform pg_temp.security_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='security_unusual_login_pattern'
      and (evidence->>'authenticated_session_count')::integer=8
      and (evidence->>'distinct_context_count')::integer=4),'eight sessions across four contexts meet threshold');
  perform pg_temp.security_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='security_unusual_login_pattern'
      and (evidence->>'authenticated_session_count')::integer=9
      and (evidence->>'distinct_context_count')::integer=5),'nine sessions across five contexts remain above');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='security';
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform pg_temp.security_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='security')=v_count,'login-pattern evaluation is idempotent');
end;
$$;

-- Trusted discrete-event detectors: failed logins 5/15m, reset requests 3/24h,
-- session invalidations 4/2h, and three distinct sensitive changes/24h.
do $$
declare
  v_now timestamptz:=now();v_user uuid;v_scenario integer;v_i integer;v_count integer;
  v_failed_below uuid:=pg_temp.security_make_user('failed-below',v_now-interval '200 days');
  v_failed_at uuid:=pg_temp.security_make_user('failed-at',v_now-interval '200 days');
  v_failed_above uuid:=pg_temp.security_make_user('failed-above',v_now-interval '200 days');
  v_reset_below uuid:=pg_temp.security_make_user('reset-below',v_now-interval '200 days');
  v_reset_at uuid:=pg_temp.security_make_user('reset-at',v_now-interval '200 days');
  v_reset_above uuid:=pg_temp.security_make_user('reset-above',v_now-interval '200 days');
  v_session_below uuid:=pg_temp.security_make_user('session-below',v_now-interval '200 days');
  v_session_at uuid:=pg_temp.security_make_user('session-at',v_now-interval '200 days');
  v_session_above uuid:=pg_temp.security_make_user('session-above',v_now-interval '200 days');
  v_change_below uuid:=pg_temp.security_make_user('change-below',v_now-interval '200 days');
  v_change_at uuid:=pg_temp.security_make_user('change-at',v_now-interval '200 days');
  v_change_above uuid:=pg_temp.security_make_user('change-above',v_now-interval '200 days');
  v_kinds text[]:=array['password','email','phone','security_settings'];
begin
  for v_scenario in 1..3 loop
    v_user:=case v_scenario when 1 then v_failed_below when 2 then v_failed_at else v_failed_above end;
    for v_i in 1..(v_scenario+3) loop
      perform pg_temp.security_add_event(v_user,'login_failed','failed-'||v_scenario||'-'||v_i,v_now-make_interval(mins=>v_i));
    end loop;
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
    v_user:=case v_scenario when 1 then v_reset_below when 2 then v_reset_at else v_reset_above end;
    for v_i in 1..(v_scenario+1) loop
      perform pg_temp.security_add_event(v_user,'password_reset_requested','reset-'||v_scenario||'-'||v_i,v_now-make_interval(hours=>v_i));
    end loop;
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
    v_user:=case v_scenario when 1 then v_session_below when 2 then v_session_at else v_session_above end;
    for v_i in 1..(v_scenario+2) loop
      perform pg_temp.security_add_event(v_user,'session_invalidated','session-'||v_scenario||'-'||v_i,v_now-make_interval(mins=>v_i*10));
    end loop;
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
    v_user:=case v_scenario when 1 then v_change_below when 2 then v_change_at else v_change_above end;
    for v_i in 1..(v_scenario+1) loop
      perform pg_temp.security_add_event(v_user,'sensitive_change','change-'||v_scenario||'-'||v_i,
        v_now-make_interval(hours=>v_i),v_kinds[v_i]);
    end loop;
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals where user_id=v_failed_below and signal_key='security_failed_login_pattern'),'four failed logins are below threshold');
  perform pg_temp.security_assert((select evidence->>'failed_attempt_count'='5' from public.account_trust_signals where user_id=v_failed_at and signal_key='security_failed_login_pattern'),'five failed logins meet threshold');
  perform pg_temp.security_assert((select evidence->>'failed_attempt_count'='6' from public.account_trust_signals where user_id=v_failed_above and signal_key='security_failed_login_pattern'),'six failed logins remain above');
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals where user_id=v_reset_below and signal_key='security_password_reset_cluster'),'two reset requests are below threshold');
  perform pg_temp.security_assert((select evidence->>'reset_request_count'='3' from public.account_trust_signals where user_id=v_reset_at and signal_key='security_password_reset_cluster'),'three reset requests meet threshold');
  perform pg_temp.security_assert((select evidence->>'reset_request_count'='4' from public.account_trust_signals where user_id=v_reset_above and signal_key='security_password_reset_cluster'),'four reset requests remain above');
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals where user_id=v_session_below and signal_key='security_session_instability'),'three invalidations are below threshold');
  perform pg_temp.security_assert((select evidence->>'session_invalidation_count'='4' from public.account_trust_signals where user_id=v_session_at and signal_key='security_session_instability'),'four invalidations meet threshold');
  perform pg_temp.security_assert((select evidence->>'session_invalidation_count'='5' from public.account_trust_signals where user_id=v_session_above and signal_key='security_session_instability'),'five invalidations remain above');
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals where user_id=v_change_below and signal_key='security_sudden_account_change'),'two change kinds are below threshold');
  perform pg_temp.security_assert((select evidence->>'distinct_change_kind_count'='3' from public.account_trust_signals where user_id=v_change_at and signal_key='security_sudden_account_change'),'three change kinds meet threshold');
  perform pg_temp.security_assert((select evidence->>'distinct_change_kind_count'='4' from public.account_trust_signals where user_id=v_change_above and signal_key='security_sudden_account_change'),'four change kinds remain above');
  for v_user in select unnest(array[v_failed_at,v_reset_at,v_session_at,v_change_at]) loop
    select count(*) into v_count from public.account_trust_signals where user_id=v_user and dimension='security';
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
    perform pg_temp.security_assert((select count(*) from public.account_trust_signals
      where user_id=v_user and dimension='security')=v_count,'discrete Security detector is idempotent');
  end loop;
end;
$$;

-- Correlation counts independent evidence families, not raw signal count. A
-- new device and its new environment remain one context family.
do $$
declare
  v_now timestamptz:=now();v_single uuid;v_at uuid;v_above uuid;v_i integer;v_count integer;
begin
  v_single:=pg_temp.security_make_user('takeover-single',v_now-interval '200 days');
  perform pg_temp.security_add_installation(v_single,'takeover-single-old','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_single,'takeover-single-new','android','14.2',v_now-interval '1 hour');
  perform public.account_trust_evaluate_security_user_v1(v_single,v_now);
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_single and signal_key='security_takeover_pattern'),
    'one ordinary context-change event cannot create a takeover pattern');

  v_at:=pg_temp.security_make_user('takeover-at',v_now-interval '200 days');
  perform pg_temp.security_add_installation(v_at,'takeover-at-old','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_at,'takeover-at-new','android','14.2',v_now-interval '1 hour');
  for v_i in 1..5 loop perform pg_temp.security_add_event(v_at,'login_failed','takeover-at-f-'||v_i,v_now-make_interval(mins=>v_i)); end loop;
  for v_i in 1..3 loop perform pg_temp.security_add_event(v_at,'password_reset_requested','takeover-at-r-'||v_i,v_now-make_interval(hours=>v_i)); end loop;
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform pg_temp.security_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='security_takeover_pattern'
      and (evidence->>'aligned_evidence_family_count')::integer=3),
    'context, failed-login, and recovery families meet takeover threshold');

  v_above:=pg_temp.security_make_user('takeover-above',v_now-interval '200 days');
  perform pg_temp.security_add_installation(v_above,'takeover-above-old','ios','17.6',v_now-interval '30 days');
  perform pg_temp.security_add_installation(v_above,'takeover-above-new','android','14.2',v_now-interval '1 hour');
  for v_i in 1..5 loop perform pg_temp.security_add_event(v_above,'login_failed','takeover-above-f-'||v_i,v_now-make_interval(mins=>v_i)); end loop;
  for v_i in 1..3 loop perform pg_temp.security_add_event(v_above,'password_reset_requested','takeover-above-r-'||v_i,v_now-make_interval(hours=>v_i)); end loop;
  for v_i in 1..4 loop perform pg_temp.security_add_event(v_above,'session_invalidated','takeover-above-s-'||v_i,v_now-make_interval(mins=>v_i*10)); end loop;
  perform public.account_trust_evaluate_security_user_v1(v_above,v_now);
  perform pg_temp.security_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='security_takeover_pattern'
      and (evidence->>'aligned_evidence_family_count')::integer=4),
    'a fourth independent evidence family remains above takeover threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='security';
  perform public.account_trust_evaluate_security_user_v1(v_at,v_now);
  perform pg_temp.security_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='security')=v_count,'takeover correlation is idempotent');
end;
$$;

-- False-positive matrix: new phone/browser/tablet, reinstall, travel, one reset,
-- forgotten-password maintenance, and OS update remain legitimate and never
-- create a takeover conclusion.
do $$
declare
  v_now timestamptz:=now();v_user uuid;v_old uuid;v_i integer;v_labels text[]:=array[
    'new-phone','new-browser','vacation','business-travel','single-reset',
    'forgotten-password','tablet','reinstall','os-update'
  ];
begin
  for v_i in 1..array_length(v_labels,1) loop
    v_user:=pg_temp.security_make_user('legitimate-'||v_labels[v_i],v_now-interval '300 days');
    v_old:=pg_temp.security_add_installation(v_user,'legitimate-'||v_labels[v_i]||'-old','ios','17.6',v_now-interval '30 days');
    if v_labels[v_i] in('new-phone','new-browser','tablet','reinstall') then
      perform pg_temp.security_add_installation(v_user,'legitimate-'||v_labels[v_i]||'-new','ios','17.6',v_now-interval '1 hour');
    elsif v_labels[v_i]='os-update' then
      perform pg_temp.security_add_installation(v_user,'legitimate-os-update-new','ios','18.0',v_now-interval '1 hour');
    elsif v_labels[v_i] in('vacation','business-travel') then
      insert into public.analytics_sessions(user_id,installation_id,platform,started_at,last_seen_at,properties)
      values(v_user,v_old,'ios',v_now-interval '1 hour',v_now-interval '1 hour','{}'::jsonb);
    elsif v_labels[v_i]='single-reset' then
      perform pg_temp.security_add_event(v_user,'password_reset_requested','legitimate-single-reset',v_now-interval '1 hour');
    else
      perform pg_temp.security_add_event(v_user,'password_reset_requested','legitimate-forgot-reset',v_now-interval '2 hours');
      perform pg_temp.security_add_event(v_user,'sensitive_change','legitimate-forgot-password',v_now-interval '1 hour','password');
    end if;
    perform public.account_trust_evaluate_security_user_v1(v_user,v_now);
    perform pg_temp.security_assert(not exists(select 1 from public.account_trust_signals
      where user_id=v_user and signal_key='security_takeover_pattern'),
      v_labels[v_i]||' does not create a takeover pattern');
    perform pg_temp.security_assert((select risk_level in('trusted','normal')
      from public.account_trust_scores where user_id=v_user),
      v_labels[v_i]||' remains a legitimate Account Trust classification');
  end loop;
end;
$$;

-- Expiry is registry-driven and historical events remain auditable.
do $$
declare v_now timestamptz:=now();v_eval timestamptz:=now()-interval '10 days';v_user uuid;v_i integer;
begin
  v_user:=pg_temp.security_make_user('expired-failures',v_now-interval '300 days');
  for v_i in 1..5 loop
    perform pg_temp.security_add_event(v_user,'login_failed','expired-failure-'||v_i,v_eval-make_interval(mins=>v_i));
  end loop;
  perform public.account_trust_evaluate_security_user_v1(v_user,v_eval);
  perform public.account_trust_recalculate_v1(v_user,null,'security_expiry_acceptance');
  perform pg_temp.security_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_user and signal_key='security_failed_login_pattern' and expires_at<=v_now),
    'expired Security signal remains in the audit trail');
  perform pg_temp.security_assert((select (dimension_scores->>'security')::numeric=60
    from public.account_trust_scores where user_id=v_user),
    'expired Security evidence no longer contributes to current Account Trust');
  perform pg_temp.security_assert(not exists(
    select 1 from public.account_trust_signals s
    join public.account_trust_signal_registry r on r.signal_key=s.signal_key
    where s.dimension='security' and s.expires_at is distinct from s.observed_at+r.default_ttl
  ),'every Security signal uses its versioned registry TTL');
end;
$$;

-- Supabase Auth audit metadata is normalized without copying payload, IP,
-- username, or user agent into Backyrd-owned tables.
do $$
declare
  v_now timestamptz:=now();v_user uuid;v_event_user uuid;
  v_audit_id uuid:=pg_temp.security_uuid('security-auth-audit-reset');v_first uuid;v_second uuid;
begin
  v_user:=pg_temp.security_make_user('auth-audit-source',v_now-interval '200 days');
  insert into auth.audit_log_entries(instance_id,id,payload,created_at,ip_address)
  values('00000000-0000-0000-0000-000000000000',v_audit_id,
    json_build_object('action','user_recovery_requested','actor_id',v_user::text),v_now,'');
  perform pg_temp.security_assert(exists(select 1
    from public.account_trust_security_event_inventory_v1(v_user,v_now-interval '1 hour',v_now)
    where event_type='password_reset_requested' and source='supabase_auth_audit'),
    'canonical Auth audit action is normalized read-only');
  perform pg_temp.security_assert(not exists(select 1 from public.account_trust_security_events
    where user_id=v_user),'Auth payload is not copied into the Backyrd event ledger');
  v_event_user:=pg_temp.security_make_user('event-idempotency',v_now-interval '200 days');
  v_first:=pg_temp.security_add_event(v_event_user,'login_failed','same-trusted-event',v_now-interval '1 minute');
  v_second:=pg_temp.security_add_event(v_event_user,'login_failed','same-trusted-event',v_now-interval '1 minute');
  perform pg_temp.security_assert(v_first=v_second and (select count(*)=1
    from public.account_trust_security_events where user_id=v_event_user),
    'trusted Security event ingestion is idempotent');
end;
$$;

-- Generic Admin contract, service-only authorization, RLS, privacy, scheduling,
-- and absence of product side effects.
do $$
declare
  v_now timestamptz:=now();v_admin uuid:=pg_temp.security_make_user('security-admin',v_now-interval '300 days');
  v_normal uuid:=pg_temp.security_make_user('security-normal',v_now-interval '300 days');
  v_target uuid:=pg_temp.security_uuid('security-user:takeover-at');v_detail jsonb;
begin
  update public.profiles set is_admin=true where id=v_admin;
  perform pg_temp.security_set_actor(v_admin);
  v_detail:=public.account_trust_admin_detail_v1(v_target);
  perform pg_temp.security_assert(
    (v_detail->'score'->'dimension_scores'->>'security') is not null
    and exists(select 1 from jsonb_array_elements(v_detail->'signals') s
      where s->>'signal_key'='security_takeover_pattern'
        and s->>'detector_version'='1.0.0'
        and (s->'evidence'->>'aligned_evidence_family_count')::integer=3),
    'generic Admin contract exposes Security score, evidence, reason, confidence, and version');
  perform pg_temp.security_set_actor(v_normal);
  perform pg_temp.security_assert(
    not has_function_privilege('authenticated','public.account_trust_security_hash_context_v1(text)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_record_security_event_v1(uuid,text,text,text,timestamp with time zone,text,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_security_event_inventory_v1(uuid,timestamp with time zone,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_evaluate_security_user_v1(uuid,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_evaluate_security_due_v1(integer,timestamp with time zone)','EXECUTE'),
    'normal users cannot emit or evaluate Security Trust signals');
  perform pg_temp.security_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'account_trust_security_%'
      and p.prosecdef and (p.proconfig is null or not exists(
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  ),'all Security SECURITY DEFINER functions use explicit search_path');
  perform pg_temp.security_assert(not exists(
    select 1 from (values('account_trust_security_detector_config'),('account_trust_security_events'),
      ('account_trust_security_evaluation_state')) t(table_name)
    join pg_class c on c.relname=t.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where not c.relrowsecurity
  ),'RLS is enabled for all private Security tables');
  perform pg_temp.security_assert(not exists(
    select 1 from (values('account_trust_security_detector_config'),('account_trust_security_events'),
      ('account_trust_security_evaluation_state')) t(table_name)
    where has_table_privilege('anon','public.'||t.table_name,'SELECT')
       or has_table_privilege('authenticated','public.'||t.table_name,'SELECT,INSERT,UPDATE,DELETE')
  ),'client roles cannot access Security detector state or events');
  perform pg_temp.security_assert(exists(select 1 from cron.job
    where jobname='backyrd-account-trust-security-15m' and active and schedule='*/15 * * * *'
      and command like '%account_trust_evaluate_security_due_v1(1000, now())%'),
    'one secret-free Security evaluation job exists');
  perform pg_temp.security_assert(not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name like 'account_trust_security%'
      and column_name in('ip','ip_address','city','country','latitude','longitude','user_agent',
        'browser_fingerprint','device_fingerprint','advertising_id','email','phone','raw_payload')),
    'Security Trust stores no invasive identifiers, location, contact data, or raw Auth payload');
  perform pg_temp.security_assert(
    (select count(*) from public.safety_account_enforcements)=(select enforcements from security_side_effect_baseline)
    and (select count(*) from public.safety_account_measures)=(select measures from security_side_effect_baseline)
    and (select count(*) from public.safety_user_enforcement_events)=(select user_events from security_side_effect_baseline)
    and (select count(*) from public.safety_enforcement_events)=(select enforcement_events from security_side_effect_baseline)
    and (select count(*) from public.ranking_config)=(select ranking_rows from security_side_effect_baseline),
    'Security Trust creates no blocking, logout, enforcement, moderation, ranking, visibility, or Distribution side effect');
end;
$$;

rollback;

\echo 'Sprint 9.4 Security Trust Signals acceptance passed.'
