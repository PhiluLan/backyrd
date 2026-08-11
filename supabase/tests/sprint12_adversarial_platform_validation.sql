\set ON_ERROR_STOP on

begin;

create function pg_temp.s12_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.s12_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 12 adversarial validation failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.s12_user(
  p_label text,p_admin_role text default null
) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.s12_uuid('user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@sprint12.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',
    now()-interval '400 days',now(),'','','',''
  );
  if p_admin_role is not null then
    update public.profiles set is_admin=true where id=v_id;
    insert into public.admin_users(user_id,role) values(v_id,p_admin_role);
  end if;
  return v_id;
end;
$$;

create function pg_temp.s12_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

create function pg_temp.s12_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
end;
$$;

create function pg_temp.s12_spot(p_label text,p_owner uuid,p_city text default 'Sprint 12 City')
returns uuid language plpgsql as $$
declare v_category uuid:=pg_temp.s12_uuid('category:'||p_label);
  v_spot uuid:=pg_temp.s12_uuid('spot:'||p_label);
begin
  insert into public.categories(id,name) values(v_category,'Sprint 12 '||p_label);
  insert into public.spots(id,name,address,lat,lng,created_by,owner_id,status,category_id,city)
  values(v_spot,'Sprint 12 '||p_label,'Synthetic 12',47.55,7.59,p_owner,p_owner,
    'approved',v_category,p_city);
  return v_spot;
end;
$$;

-- Canonical architecture, privilege boundary and SECURITY DEFINER hygiene.
do $$
declare v_sensitive_table text;v_function regprocedure;
begin
  perform pg_temp.s12_assert((select count(*)=6 and count(distinct dimension)=6
    and abs(sum(weight)-1)<0.0001 from public.account_trust_dimension_config
    where engine_version=(select version from public.account_trust_engine_versions where status='active')),
    'all six Account Trust dimensions exist once and weights total 100 percent');
  perform pg_temp.s12_assert((select count(*)=1 from public.account_trust_engine_versions where status='active')
    and (select count(*)=1 from public.distribution_trust_engine_versions where status='active')
    and (select count(*)=1 from public.governance_versions where status='active'),
    'Trust, Distribution and Governance each have one active version');

  foreach v_sensitive_table in array array[
    'public.account_trust_signals','public.account_trust_scores',
    'public.account_trust_signal_events','public.account_trust_network_evaluation_state',
    'public.account_trust_security_events','public.account_trust_owner_events',
    'public.distribution_trust_states','public.distribution_trust_overrides',
    'public.distribution_trust_history','public.governance_incidents',
    'public.governance_audit_events','public.governance_break_glass_events'
  ] loop
    perform pg_temp.s12_assert(
      not has_table_privilege('anon',v_sensitive_table,'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated',v_sensitive_table,'SELECT,INSERT,UPDATE,DELETE'),
      v_sensitive_table||' is not directly accessible to client roles');
  end loop;

  foreach v_function in array array[
    'public.account_trust_emit_signal_v1(uuid,text,text,text,numeric,numeric,timestamptz,timestamptz,text,jsonb,jsonb)'::regprocedure,
    'public.account_trust_evaluate_network_user_v1(uuid,timestamptz)'::regprocedure,
    'public.account_trust_record_security_event_v1(uuid,text,text,text,timestamptz,text,text)'::regprocedure,
    'public.account_trust_record_owner_event_v1(uuid,text,text,text,timestamptz,text)'::regprocedure,
    'public.distribution_trust_evaluate_content_v1(uuid,timestamptz,text)'::regprocedure,
    'public.distribution_trust_evaluate_due_v1(integer,timestamptz)'::regprocedure,
    'public.governance_expire_break_glass_v1(timestamptz)'::regprocedure
  ] loop
    perform pg_temp.s12_assert(
      not has_function_privilege('anon',v_function,'EXECUTE')
      and not has_function_privilege('authenticated',v_function,'EXECUTE')
      and has_function_privilege('service_role',v_function,'EXECUTE'),
      v_function::text||' remains service-only');
  end loop;

  perform pg_temp.s12_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (p.proname like 'account_trust_%' or p.proname like 'distribution_trust_%'
        or p.proname like 'governance_%' or p.proname like 'founder_%')
      and (coalesce(array_to_string(p.proconfig,','),'') !~ 'search_path=.*pg_catalog'
        or coalesce(array_to_string(p.proconfig,','),'') ~ '(pg_temp|\\$user)')
  ),'all privileged Trust/Governance functions pin a safe search_path');
end;
$$;

-- Signal replay, missing idempotency, negative inputs, expiry and auditability.
do $$
declare v_user uuid:=pg_temp.s12_user('signal-user');v_result jsonb;v_signal uuid;
  v_denied boolean:=false;v_history bigint;v_events bigint;
begin
  perform pg_temp.s12_service();
  begin
    perform public.account_trust_emit_signal_v1(v_user,'identity_email_verified',
      'backyrd.sprint12.replay','1.0.0',0.5,0.5,now(),null,null,'{}','{}');
  exception when invalid_parameter_value or not_null_violation then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied,
    'signal emission without an idempotency key is rejected rather than replayable');

  v_result:=public.account_trust_emit_signal_v1(v_user,'identity_email_verified',
    'backyrd.sprint12.replay','1.0.0',0.5,0.5,now(),null,'stable-event','{}','{}');
  v_signal:=(v_result->>'signal_id')::uuid;
  select count(*) into v_history from public.account_trust_score_history where user_id=v_user;
  select count(*) into v_events from public.account_trust_signal_events where signal_id=v_signal;
  v_result:=public.account_trust_emit_signal_v1(v_user,'identity_email_verified',
    'backyrd.sprint12.replay','1.0.0',0.5,0.5,now(),null,'stable-event','{}','{}');
  perform pg_temp.s12_assert((v_result->>'duplicate')::boolean
    and (select count(*)=1 from public.account_trust_signals where user_id=v_user
      and detector_key='backyrd.sprint12.replay' and deduplication_key='stable-event')
    and (select count(*)=v_events from public.account_trust_signal_events where signal_id=v_signal)
    and (select count(*)=v_history from public.account_trust_score_history where user_id=v_user),
    'replayed signal submission is a stable no-op across signal, event and score history');

  v_denied:=false;
  begin
    perform public.account_trust_emit_signal_v1(v_user,'identity_email_verified',
      'backyrd.sprint12.input','1.0.0',1.01,1,now(),null,'invalid-strength','{}','{}');
  exception when invalid_parameter_value then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied,'out-of-range signal strength is rejected safely');

  v_result:=public.account_trust_emit_signal_v1(v_user,'security_new_device',
    'backyrd.sprint12.expiry','1.0.0',0.4,0.4,now()-interval '2 days',
    now()-interval '1 day','expired-event','{}','{}');
  perform pg_temp.s12_assert((select s.active_signal_count=(select count(*) from public.account_trust_signals x
      where x.user_id=v_user and x.status='active' and (x.expires_at is null or x.expires_at>now()))
      and not ((select reason_code from public.account_trust_signal_registry
        where signal_key='security_new_device')=any(s.reason_codes))
    from public.account_trust_scores s where s.user_id=v_user),
    'expired evidence stops contributing while other durable evidence remains');
  perform pg_temp.s12_assert((select status='active' and expires_at<now() from public.account_trust_signals
    where id=(v_result->>'signal_id')::uuid),'expired evidence remains historically auditable');
end;
$$;

-- Governance authority, severity downgrade resistance, lifecycle and Break Glass.
do $$
declare v_founder uuid:=pg_temp.s12_user('founder','super_admin');
  v_admin uuid:=pg_temp.s12_user('trust-admin','admin');
  v_senior uuid:=pg_temp.s12_user('senior');v_normal uuid:=pg_temp.s12_user('normal');
  v_incident uuid;v_result jsonb;v_denied boolean:=false;v_break uuid;v_audit bigint;
begin
  perform pg_temp.s12_actor(v_founder);
  perform public.governance_assign_role_v1(v_senior,'senior_moderator',
    'Sprint 12 independent reviewer assignment.');
  v_result:=public.governance_create_incident_v1('S4',
    'Synthetic critical incident for adversarial downgrade validation.',
    array['governance','distribution_trust'],now(),v_founder,array[v_normal],array[]::uuid[]);
  v_incident:=(v_result->>'incident_id')::uuid;

  perform pg_temp.s12_actor(v_admin);
  begin
    perform public.governance_change_severity_v1(v_incident,'S0',
      'Attempt to bypass critical oversight through a severity downgrade.');
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied and
    (select severity_key='S4' from public.governance_incidents where id=v_incident),
    'non-Founder cannot downgrade a major incident and bypass critical oversight');

  perform pg_temp.s12_actor(v_founder);
  perform public.governance_change_severity_v1(v_incident,'S3',
    'Founder accountable downgrade after reviewing the synthetic critical impact.');
  perform pg_temp.s12_assert((select severity_key='S3' from public.governance_incidents where id=v_incident),
    'Founder retains explicit authority for an accountable major severity downgrade');

  v_denied:=false;
  begin
    perform public.governance_activate_break_glass_v1('trust_automation','paused',v_incident,
      'short',now()+interval '30 minutes');
  exception when invalid_parameter_value then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied,'Break Glass without a meaningful reason is rejected');
  v_result:=public.governance_activate_break_glass_v1('trust_automation','paused',v_incident,
    'Pause synthetic Trust automation for deterministic Sprint 12 recovery.',now()+interval '1 minute');
  v_break:=(v_result->>'break_glass_id')::uuid;
  perform pg_temp.s12_service();
  perform pg_temp.s12_assert((public.account_trust_evaluate_identity_due_v1(5,now())->>'paused')::boolean,
    'active Break Glass retains work and pauses the canonical evaluator');
  perform public.governance_expire_break_glass_v1(now()+interval '2 minutes');
  perform public.governance_expire_break_glass_v1(now()+interval '3 minutes');
  perform pg_temp.s12_assert(public.governance_effective_control_mode_v1('trust_automation')='automatic'
    and (select status='expired' from public.governance_break_glass_events where id=v_break)
    and (select count(*)=1 from public.governance_audit_events
      where event_key='break_glass_expired:'||v_break),
    'Break Glass expiry restores once without orphan state or duplicate audit');

  select id into v_audit from public.governance_audit_events where incident_id=v_incident order by id limit 1;
  v_denied:=false;
  begin update public.governance_audit_events set reason='forbidden mutation' where id=v_audit;
  exception when object_not_in_prerequisite_state then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied,'Governance audit rejects mutation even from a privileged SQL path');
end;
$$;

-- Distribution input boundaries, one policy, safe fallback and reversible state.
do $$
declare v_owner uuid:=pg_temp.s12_user('distribution-owner');
  v_admin uuid:=pg_temp.s12_user('distribution-admin','admin');
  v_spot uuid:=pg_temp.s12_spot('distribution',v_owner);v_content uuid;
  v_result jsonb;v_denied boolean:=false;v_history bigint;
begin
  select id into v_content from public.safety_content_items where entity_type='spot' and entity_id=v_spot;
  perform pg_temp.s12_assert((select count(*)=14 from public.distribution_trust_policy_rules
    where engine_version=(select version from public.distribution_trust_engine_versions where status='active')
      and enabled),'one complete versioned Distribution policy matrix is active');
  v_denied:=false;
  begin perform * from public.distribution_trust_filter_entities_v1('spot',array[v_spot],'unknown');
  exception when invalid_parameter_value then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied,'unknown Distribution consumer surfaces fail safely');
  perform pg_temp.s12_assert((select count(*)=1 from public.distribution_trust_filter_entities_v1(
    'spot',array[v_spot,v_spot,null::uuid],'search')),
    'duplicate, replayed and NULL candidate identifiers cannot duplicate output');

  perform pg_temp.s12_actor(v_admin);
  v_result:=public.distribution_trust_set_override_v1(v_content,'quarantined',
    'DISTRIBUTION_ADMIN_FORCE_QUARANTINED','Sprint 12 safe fallback validation.',now()+interval '1 minute');
  perform pg_temp.s12_assert(v_result->>'effective_state'='quarantined'
    and (select count(*)=0 from public.distribution_trust_spot_catalog_v1(null,'Sprint 12 City',20,'search')),
    'quarantined-only candidate pool fails closed instead of bypassing policy');
  select count(*) into v_history from public.distribution_trust_history where content_item_id=v_content;
  perform pg_temp.s12_service();
  perform public.distribution_trust_evaluate_due_v1(100,now()+interval '2 minutes');
  perform public.distribution_trust_evaluate_due_v1(100,now()+interval '3 minutes');
  perform pg_temp.s12_assert((select effective_state='normal' and active_override_id is null
    from public.distribution_trust_states where content_item_id=v_content)
    and (select count(*)=v_history+1 from public.distribution_trust_history where content_item_id=v_content)
    and (select count(*)=1 from public.distribution_trust_events where content_item_id=v_content
      and event_type='automatically_restored'),
    'override expiry restores exactly once and consumers re-enter automatically');
end;
$$;

-- Storage metadata and policy boundaries without reading or copying object data.
do $$
begin
  perform pg_temp.s12_assert((select count(*)=7 from storage.buckets where id in(
    'badges','chat-uploads','data-rights-exports','profile-photos','review-photos',
    'social-post-media','spot-photos')),'all canonical Storage buckets exist');
  perform pg_temp.s12_assert((select not public from storage.buckets where id='chat-uploads')
    and (select not public from storage.buckets where id='data-rights-exports')
    and (select not public from storage.buckets where id='social-post-media'),
    'private Storage buckets remain private');
  perform pg_temp.s12_assert((select count(*)=19 from pg_policies
    where schemaname='storage' and tablename in('objects','buckets')),
    'canonical Storage policy set is complete');
  perform pg_temp.s12_assert(not exists(
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname in('chat_uploads_insert_participant_v1','review_photos_upload_own_review',
        'profile_photos_upload_own','social_post_media_user_upload')
      and roles @> array['public'::name]
  ),'private upload policies never grant anonymous/public writes');
end;
$$;

-- Founder consistency, privacy-safe output and current Git launch truth.
do $$
declare v_admin uuid:=pg_temp.s12_uuid('user:distribution-admin');
  v_normal uuid:=pg_temp.s12_uuid('user:normal');v_result jsonb;v_denied boolean:=false;
begin
  perform pg_temp.s12_actor(v_normal);
  begin perform public.founder_launch_overview_v1();
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.s12_assert(v_denied,'normal users cannot read Founder contracts');
  perform pg_temp.s12_actor(v_admin);
  v_result:=public.founder_launch_overview_v1();
  perform pg_temp.s12_assert(v_result->'readiness'->>'launch_status'='BLOCKED'
    and (v_result->'readiness'->>'p0_remaining')::integer>0,
    'Founder Launch Gate truth remains blocked while evidence-backed P0 gates are open');
  perform pg_temp.s12_assert(not jsonb_path_exists(v_result,'$.**.trust_score')
    and not jsonb_path_exists(v_result,'$.**.dimension_scores')
    and not jsonb_path_exists(v_result,'$.**.private_evidence'),
    'Founder overview does not expose private raw Trust evidence or account scores');
end;
$$;

-- Controlled isolated latency guard. This detects pathological regressions;
-- it is not a claim about Production latency or capacity.
do $$
declare v_owner uuid:=pg_temp.s12_user('performance');v_ids uuid[]:=array[]::uuid[];
  v_id uuid;v_start timestamptz;v_filter_ms numeric;v_health_ms numeric;i integer;
begin
  for i in 1..40 loop
    v_id:=pg_temp.s12_spot('performance-'||i,v_owner,'Sprint 12 Performance');
    v_ids:=array_append(v_ids,v_id);
  end loop;
  v_start:=clock_timestamp();
  for i in 1..100 loop
    perform count(*) from public.distribution_trust_filter_entities_v1('spot',v_ids,'search');
  end loop;
  v_filter_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  perform pg_temp.s12_actor(pg_temp.s12_uuid('user:distribution-admin'));
  v_start:=clock_timestamp();perform public.governance_platform_health_v1();
  v_health_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  raise notice 'Sprint 12 isolated performance ms: distribution_filter_100=% governance_health=%',
    round(v_filter_ms,2),round(v_health_ms,2);
  perform pg_temp.s12_assert(v_filter_ms<5000 and v_health_ms<5000,
    'isolated Trust/Governance contracts stay within conservative regression budgets');
end;
$$;

rollback;

\echo 'Sprint 12 adversarial platform validation passed.'
