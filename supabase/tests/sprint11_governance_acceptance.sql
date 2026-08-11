\set ON_ERROR_STOP on

begin;

create function pg_temp.gov_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.gov_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 11 Governance acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.gov_user(p_label text,p_admin_role text default null) returns uuid
language plpgsql as $$
declare v_id uuid:=pg_temp.gov_uuid('user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@governance.invalid','',now(),'{}','{}',now()-interval '400 days',now(),'','','',''
  );
  if p_admin_role is not null then
    update public.profiles set is_admin=true where id=v_id;
    insert into public.admin_users(user_id,role) values(v_id,p_admin_role);
  end if;
  insert into public.account_trust_scores(
    user_id,engine_version,trust_score,risk_level,dimension_scores,reason_codes,active_signal_count
  ) select v_id,version,60,'normal',
    '{"identity":60,"behaviour":60,"network":60,"security":60,"owner":60,"reputation":60}',
    array[]::text[],0 from public.account_trust_engine_versions where status='active'
  on conflict(user_id) do nothing;
  return v_id;
end;
$$;

create function pg_temp.gov_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

create function pg_temp.gov_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
end;
$$;

create function pg_temp.gov_spot(p_owner uuid) returns uuid language plpgsql as $$
declare v_category uuid:=pg_temp.gov_uuid('category');v_spot uuid:=pg_temp.gov_uuid('spot');
begin
  insert into public.categories(id,name) values(v_category,'Governance') on conflict(id) do nothing;
  insert into public.spots(id,name,address,lat,lng,created_by,owner_id,status,category_id,city)
  values(v_spot,'Governance Spot','Acceptance 11',47.55,7.59,p_owner,p_owner,'approved',v_category,'Governance City')
  on conflict(id) do nothing;
  return v_spot;
end;
$$;

-- Versioned registries, role boundaries, severity independence and retention.
do $$
begin
  perform pg_temp.gov_assert((select count(*)=1 from public.governance_versions where status='active'),
    'exactly one Governance model is active');
  perform pg_temp.gov_assert((select array_agg(severity_key order by severity_rank)=array['S0','S1','S2','S3','S4']
    from public.governance_severity_registry),'canonical S0-S4 severity model exists exactly once');
  perform pg_temp.gov_assert((select count(*)=5 from public.governance_role_registry),
    'five canonical responsibility roles exist');
  perform pg_temp.gov_assert((select requires_second_reviewer and requires_postmortem
    from public.governance_severity_registry where severity_key='S3')
    and (select requires_founder_attention from public.governance_severity_registry where severity_key='S4'),
    'major severities require independent oversight');
  perform pg_temp.gov_assert(not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='governance_incidents' and column_name like '%distribution%'),
    'incident severity is independent from Distribution state');
  perform pg_temp.gov_assert((select count(*)=7 from public.governance_retention_policies)
    and (select retention_days=2555 from public.governance_retention_policies where record_class='governance_audit')
    and (select retention_days=365 from public.governance_retention_policies where record_class='evidence_reference'),
    'conservative versioned retention is explicit');
end;
$$;

-- Role assignment, normal-user denial, critical escalation, second review,
-- incident lifecycle, independently reviewed postmortem and immutable audit.
do $$
declare v_founder uuid:=pg_temp.gov_user('founder','super_admin');
  v_admin uuid:=pg_temp.gov_user('trust-admin','admin');
  v_senior uuid:=pg_temp.gov_user('senior');v_moderator uuid:=pg_temp.gov_user('moderator');
  v_normal uuid:=pg_temp.gov_user('normal');v_result jsonb;v_incident uuid;v_escalation uuid;
  v_postmortem uuid;v_denied boolean:=false;v_audit bigint;
begin
  perform pg_temp.gov_actor(v_founder);
  perform pg_temp.gov_assert(public.governance_current_role_v1(v_founder)='founder'
    and public.governance_current_role_v1(v_admin)='trust_admin',
    'existing Admin authority maps deterministically to Governance responsibility');
  perform public.governance_assign_role_v1(v_senior,'senior_moderator','Independent incident reviewer for Governance acceptance.');
  perform public.governance_assign_role_v1(v_moderator,'moderator','Incident triage responsibility for Governance acceptance.');
  perform pg_temp.gov_assert(public.governance_current_role_v1(v_senior)='senior_moderator',
    'Founder can assign a canonical responsibility role');

  perform pg_temp.gov_actor(v_normal);
  begin perform public.governance_admin_overview_v1(null,10);
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'normal users cannot read private Governance contracts');
  v_denied:=false;
  begin perform public.governance_create_incident_v1('S2','Unauthorized synthetic incident.',array['distribution']);
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'normal users cannot create incidents');

  perform pg_temp.gov_actor(v_founder);
  v_result:=public.governance_create_incident_v1(
    'S4','Critical synthetic Trust Platform incident for lifecycle acceptance.',
    array['review_trust','account_trust','distribution_trust'],now(),v_founder,array[v_normal],array[]::uuid[]
  );
  v_incident:=(v_result->>'incident_id')::uuid;
  perform pg_temp.gov_assert((select severity_key='S4' and status='detected'
    from public.governance_incidents where id=v_incident),'critical incident is canonical and owned');
  select id into v_escalation from public.governance_escalations where incident_id=v_incident;
  perform pg_temp.gov_assert((select required_role='founder' and status='open'
    from public.governance_escalations where id=v_escalation),'S4 immediately escalates to Founder attention');

  perform pg_temp.gov_actor(v_admin);
  v_denied:=false;
  begin perform public.governance_acknowledge_escalation_v1(v_escalation,'Trust Admin cannot acknowledge Founder escalation.');
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'critical escalation cannot be acknowledged below Founder authority');

  perform pg_temp.gov_actor(v_founder);
  perform public.governance_acknowledge_escalation_v1(v_escalation,'Founder acknowledged the critical synthetic incident.');
  perform public.governance_set_incident_status_v1(v_incident,'investigating','Accountable investigation has started.');
  perform public.governance_link_incident_v1(v_incident,'external_runbook','runbook:sprint11',
    'Synthetic runbook reference without private evidence.');
  perform pg_temp.gov_assert(public.governance_link_incident_v1(v_incident,'external_runbook','runbook:sprint11',
    'Synthetic runbook reference without private evidence.') is not null,'incident links are idempotent');

  v_denied:=false;
  begin perform public.governance_set_incident_status_v1(v_incident,'resolved',
    'Attempted resolution before independent review.','Synthetic root cause is understood.','Synthetic resolution is complete.');
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'major incident cannot resolve without a second reviewer');

  perform pg_temp.gov_actor(v_senior);
  perform public.governance_review_incident_v1(v_incident,'concur',
    'Independent reviewer confirms containment and root cause evidence.');
  perform pg_temp.gov_actor(v_admin);
  perform public.governance_set_incident_status_v1(v_incident,'resolved',
    'Independent review complete; incident is resolved.',
    'Synthetic queue coordination failed during the acceptance scenario.',
    'Canonical recovery restored every supervised system.',
    'Keep deterministic incident and restart coverage in CI.');
  v_postmortem:=public.governance_publish_postmortem_v1(
    v_incident,'Critical Trust Platform incident was safely contained and restored.',
    'Detection, escalation, independent review, restoration and verification completed in order.',
    'Synthetic queue coordination exposed a bounded operational failure without changing Trust policy.',
    'No production users or content were affected during this isolated acceptance test.',
    'Canonical escalation, last-known-safe state and independent review worked as designed.',
    'The original operational path required explicit durable Governance supervision.',
    '[{"action":"retain Sprint 11 acceptance in canonical CI","owner":"engineering","status":"open"}]'::jsonb,
    v_senior
  );
  perform public.governance_set_incident_status_v1(v_incident,'closed',
    'Published postmortem completes accountable incident closure.',null,null,null);
  perform pg_temp.gov_assert((select status='closed' from public.governance_incidents where id=v_incident)
    and (select status='published' from public.governance_postmortems where id=v_postmortem),
    'major incident closes only after independent review and postmortem');

  select id into v_audit from public.governance_audit_events where incident_id=v_incident order by id limit 1;
  v_denied:=false;
  begin update public.governance_audit_events set reason='Mutation must fail.' where id=v_audit;
  exception when object_not_in_prerequisite_state then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'Governance audit is immutable even to direct SQL mutation');
  perform pg_temp.gov_assert(not exists(select 1 from public.governance_audit_events
    where source='human' and actor_user_id is null),'every human Governance action has an actor');
end;
$$;

-- Break Glass is incident-bound, role-bound, reversible, time-bounded and
-- pauses only the central automated entrypoint while retaining last-known-safe
-- Distribution state.
do $$
declare v_founder uuid:=pg_temp.gov_uuid('user:founder');v_admin uuid:=pg_temp.gov_uuid('user:trust-admin');
  v_normal uuid:=pg_temp.gov_uuid('user:normal');v_result jsonb;v_incident uuid;
  v_break_glass uuid;v_denied boolean:=false;v_audit_before bigint;
  v_spot uuid;v_content uuid;v_case uuid:=pg_temp.gov_uuid('break-glass-safety-case');
begin
  perform pg_temp.gov_actor(v_admin);
  v_result:=public.governance_create_incident_v1(
    'S3','High synthetic Distribution evaluator incident requiring bounded mitigation.',
    array['distribution_trust'],now(),v_admin,array[]::uuid[],array[]::uuid[]
  );
  v_incident:=(v_result->>'incident_id')::uuid;

  perform pg_temp.gov_actor(v_normal);
  begin perform public.governance_activate_break_glass_v1(
    'distribution_automation','paused',v_incident,
    'Unauthorized user cannot pause canonical Distribution automation.',now()+interval '30 minutes');
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'normal users cannot activate Break Glass');

  perform pg_temp.gov_actor(v_admin);
  v_result:=public.governance_activate_break_glass_v1(
    'distribution_automation','paused',v_incident,
    'Pause automatic evaluation while the synthetic S3 incident is investigated.',now()+interval '30 minutes');
  v_break_glass:=(v_result->>'break_glass_id')::uuid;
  perform pg_temp.gov_assert(public.governance_effective_control_mode_v1('distribution_automation')='paused'
    and (select status='active' from public.governance_break_glass_events where id=v_break_glass),
    'authorized Break Glass activates a durable bounded control');

  perform pg_temp.gov_service();
  v_result:=public.distribution_trust_evaluate_due_v1(100,now());
  perform pg_temp.gov_assert((v_result->>'paused')::boolean
    and v_result->>'failsafe'='last_known_canonical_state',
    'Distribution automation pauses with an explicit fail-closed last-known-safe result');

  perform pg_temp.gov_actor(v_admin);
  perform public.governance_release_break_glass_v1(
    'distribution_automation','Investigation complete; return to canonical automatic evaluation.');
  perform pg_temp.gov_assert(public.governance_effective_control_mode_v1('distribution_automation')='automatic'
    and (public.governance_release_break_glass_v1('distribution_automation',
      'Repeated release remains safely idempotent.')->>'duplicate')::boolean,
    'manual release restores automatic mode idempotently');

  v_result:=public.governance_activate_break_glass_v1(
    'trust_automation','manual_only',v_incident,
    'Temporarily require manual fallback during the synthetic Trust incident.',now()+interval '1 minute');
  perform pg_temp.gov_service();
  perform pg_temp.gov_assert(
    (public.account_trust_evaluate_identity_due_v1(100,now())->>'paused')::boolean
    and (public.account_trust_evaluate_behaviour_due_v1(100,now())->>'paused')::boolean
    and (public.account_trust_evaluate_network_due_v1(100,now())->>'paused')::boolean
    and (public.account_trust_evaluate_security_due_v1(100,now())->>'paused')::boolean
    and (public.account_trust_evaluate_owner_due_v1(100,now())->>'paused')::boolean
    and (public.account_trust_evaluate_reputation_due_v1(100,now())->>'paused')::boolean,
    'Break Glass pauses every scheduled Account Trust dimension at one canonical gate');
  perform public.governance_expire_break_glass_v1(now()+interval '2 minutes');
  perform pg_temp.gov_assert(public.governance_effective_control_mode_v1('trust_automation')='automatic'
    and (select current_mode='automatic' and active_break_glass_id is null
      from public.governance_system_controls where control_key='trust_automation'),
    'expired Break Glass automatically restores operation without an orphan control');
  perform pg_temp.gov_assert((select count(*)=2 from public.governance_audit_events
    where object_type='break_glass' and object_id=(v_result->>'break_glass_id')),
    'Break Glass activation and automatic restoration remain fully audited');

  perform pg_temp.gov_actor(v_admin);
  v_spot:=pg_temp.gov_spot(v_normal);
  select id into v_content from public.safety_content_items where entity_type='spot' and entity_id=v_spot;
  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(v_case,v_content,'queued',20);
  insert into public.safety_text_evaluation_jobs(content_item_id,case_id,content_hash)
  values(v_content,v_case,'governance-text-claim');
  insert into public.safety_image_evaluation_jobs(content_item_id,case_id,image_index,image_reference,image_hash)
  values(v_content,v_case,0,'governance://synthetic-image','governance-image-claim');
  perform public.governance_activate_break_glass_v1(
    'safety_automation','manual_only',v_incident,
    'Require manual Safety fallback while the synthetic worker incident is investigated.',now()+interval '30 minutes');
  perform pg_temp.gov_service();
  perform pg_temp.gov_assert(
    (select count(*)=0 from public.safety_claim_text_jobs_v1('sprint11-paused',10))
    and (select count(*)=0 from public.safety_claim_image_jobs_v1('sprint11-paused',5))
    and (select count(*)=1 from public.safety_text_evaluation_jobs where case_id=v_case and status='pending')
    and (select count(*)=1 from public.safety_image_evaluation_jobs where case_id=v_case and status='pending'),
    'Safety manual fallback leaves pending work intact and prevents new worker claims');
  perform pg_temp.gov_actor(v_admin);
  perform public.governance_release_break_glass_v1(
    'safety_automation','Safety worker path verified; restore canonical automatic claims.');
  perform pg_temp.gov_service();
  perform * from public.safety_claim_text_jobs_v1('sprint11-restored',50);
  perform * from public.safety_claim_image_jobs_v1('sprint11-restored',20);
  perform pg_temp.gov_assert(
    (select status='processing' and locked_by='sprint11-restored'
      from public.safety_text_evaluation_jobs where case_id=v_case)
    and (select status='processing' and locked_by='sprint11-restored'
      from public.safety_image_evaluation_jobs where case_id=v_case),
    'Safety worker claims resume automatically after accountable restoration');
end;
$$;

-- Explainability, existing lifecycle audit capture, platform health, Founder
-- integration, privacy and absence of Trust/product side effects.
do $$
declare v_admin uuid:=pg_temp.gov_uuid('user:trust-admin');v_normal uuid:=pg_temp.gov_uuid('user:normal');
  v_spot uuid;v_content uuid;v_case uuid:=pg_temp.gov_uuid('explain-case');v_decision uuid:=pg_temp.gov_uuid('decision');
  v_appeal uuid:=pg_temp.gov_uuid('appeal');v_result jsonb;v_health jsonb;v_founder jsonb;
  v_denied boolean:=false;v_policy_count bigint;v_registry_count bigint;v_enforcement_count bigint;
begin
  select count(*) into v_policy_count from public.distribution_trust_policy_rules;
  select count(*) into v_registry_count from public.account_trust_signal_registry;
  select count(*) into v_enforcement_count from public.safety_enforcement_events;
  v_spot:=pg_temp.gov_spot(v_normal);
  select id into v_content from public.safety_content_items where entity_type='spot' and entity_id=v_spot;
  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(v_case,v_content,'needs_review',60);

  perform pg_temp.gov_actor(v_admin);
  insert into public.safety_decision_events(
    id,case_id,action,category,severity,confidence,source,policy_snapshot,reason_codes,actor_user_id
  ) values(v_decision,v_case,'allow','none',0,1,'admin','{"policy_version":"safety-v1"}',
    array['HUMAN_REVIEW_COMPLETE'],v_admin);
  insert into public.safety_appeals(
    id,case_id,appellant_user_id,statement,status,appeal_reason,original_action
  ) values(v_appeal,v_case,v_normal,'Synthetic appeal statement for Governance acceptance.','submitted','decision_incorrect','allow');
  perform public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform public.distribution_trust_set_override_v1(v_content,'reduced','DISTRIBUTION_ADMIN_FORCE_REDUCED',
    'Synthetic Governance audit override.',null);

  v_result:=public.governance_decision_explain_v1('distribution',v_content);
  perform pg_temp.gov_assert(v_result->>'domain'='distribution'
    and v_result?'human_explanation' and v_result?'technical_explanation'
    and v_result?'evidence_references' and v_result?'policy_version' and v_result?'history',
    'Distribution decision is fully explainable without raw evidence');
  v_result:=public.governance_decision_explain_v1('account_trust',v_normal);
  perform pg_temp.gov_assert(v_result->>'domain'='account_trust' and v_result?'policy_version',
    'Account Trust decision is versioned and explainable');
  v_result:=public.governance_decision_explain_v1('safety_case',v_case);
  perform pg_temp.gov_assert(v_result->>'domain'='safety_case' and v_result?'history',
    'Safety decision history is explainable');
  perform pg_temp.gov_assert((select count(*)>=1 from public.governance_audit_events
      where object_type='safety_decision' and object_id=v_decision::text)
    and (select count(*)>=1 from public.governance_audit_events
      where object_type='appeal' and object_id=v_appeal::text)
    and (select count(*)>=1 from public.governance_audit_events
      where object_type='distribution_override'),
    'overrides, appeals and Safety decisions feed immutable Governance audit');

  v_health:=public.governance_platform_health_v1();
  perform pg_temp.gov_assert(v_health?'failed_evaluations' and v_health?'stuck_queues'
    and v_health?'stale_trust_states' and v_health?'stale_distribution_states'
    and v_health?'orphan_overrides' and v_health?'missing_restorations'
    and v_health?'evaluation_latency_ms' and v_health?'controls',
    'Platform Health covers failure, staleness, restoration and latency');
  perform pg_temp.gov_assert(v_health->>'privacy' like 'Aggregated operational metadata%',
    'health contract explicitly excludes personal and private Trust evidence');
  v_founder:=public.founder_launch_overview_v1();
  perform pg_temp.gov_assert(v_founder->'trust_health'?'governance'
    and v_founder->'trust_health'->'governance'?'platform_health'
    and v_founder->'trust_health'->'governance'?'open_incidents'
    and v_founder->'trust_health'->'governance'?'current_escalations'
    and v_founder->'trust_health'->'governance'?'recent_postmortems',
    'Founder Control Center receives live Governance oversight without copied state');

  perform pg_temp.gov_actor(v_normal);
  begin perform public.governance_decision_explain_v1('account_trust',v_admin);
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.gov_assert(v_denied,'normal users cannot read another account private Trust explanation');
  perform pg_temp.gov_assert(not has_table_privilege('anon','public.governance_incidents','SELECT')
    and not has_table_privilege('authenticated','public.governance_audit_events','SELECT'),
    'private Governance tables have no direct client privileges');
  perform pg_temp.gov_assert((select count(*) from public.distribution_trust_policy_rules)=v_policy_count
    and (select count(*) from public.account_trust_signal_registry)=v_registry_count
    and (select count(*) from public.safety_enforcement_events)=v_enforcement_count,
    'Governance does not modify Distribution policy, Trust signals or enforcement');
end;
$$;

-- SECURITY DEFINER posture and Red Team readiness.
do $$
begin
  perform pg_temp.gov_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'governance_%_v1'
      and p.prosecdef and (p.proconfig is null or not exists(
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  ),'every SECURITY DEFINER Governance function has an explicit search_path');
  perform pg_temp.gov_assert(not exists(
    select 1 from information_schema.routine_privileges
    where specific_schema='public' and routine_name like 'governance_%'
      and grantee in ('PUBLIC','anon')
  ),'PUBLIC and anon cannot execute Governance functions');
  perform pg_temp.gov_assert(
    not has_function_privilege('service_role','public.account_trust_evaluate_identity_due_uncontrolled_v1(integer,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('service_role','public.safety_claim_text_jobs_uncontrolled_v1(text,integer)','EXECUTE')
    and has_function_privilege('service_role','public.account_trust_evaluate_identity_due_v1(integer,timestamp with time zone)','EXECUTE')
    and has_function_privilege('service_role','public.safety_claim_text_jobs_v1(text,integer)','EXECUTE'),
    'workers can use only governed automation entrypoints and cannot bypass Break Glass');
  perform pg_temp.gov_assert((select count(*)>=3 from public.governance_system_controls)
    and (select count(*)>=3 from public.governance_escalation_rules)
    and (select count(*)=7 from public.governance_retention_policies),
    'Red Team has versioned controls, escalation and retention contracts to exercise');
end;
$$;

rollback;

\echo 'Sprint 11 Governance & Incident Response acceptance passed.'
