\set ON_ERROR_STOP on

begin;

create function pg_temp.dt_uuid(p_label text) returns uuid
language sql immutable
as $$
  select (
    substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12)
  )::uuid;
$$;

create function pg_temp.dt_assert(p_ok boolean,p_message text) returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 10 Distribution Trust acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.dt_user(p_label text,p_admin boolean default false) returns uuid
language plpgsql
as $$
declare v_user uuid:=pg_temp.dt_uuid('user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,
    raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated',
    p_label||'@sprint10.invalid','','{}','{}',now()-interval '400 days',now(),'','','',''
  );
  update public.profiles set is_admin=p_admin where id=v_user;
  return v_user;
end;
$$;

create function pg_temp.dt_content(p_label text,p_actor uuid) returns uuid
language plpgsql
as $$
declare v_content uuid:=pg_temp.dt_uuid('content:'||p_label);
begin
  insert into public.safety_content_items(
    id,content_type,entity_type,entity_id,actor_user_id,lifecycle_status,text_content
  ) values(
    v_content,'text','review',pg_temp.dt_uuid('entity:'||p_label),p_actor,'live',
    'Synthetic Sprint 10 distribution fixture.'
  );
  return v_content;
end;
$$;

create function pg_temp.dt_set_actor(p_user uuid) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

create function pg_temp.dt_set_service() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
end;
$$;

-- Canonical model, versioning, privacy and privilege boundaries.
do $$
declare v_normal uuid:=pg_temp.dt_user('normal-user');
begin
  perform pg_temp.dt_assert((select count(*)=1 from public.distribution_trust_engine_versions
    where status='active' and version='distribution-trust-v1'),
    'exactly one canonical engine version is active');
  perform pg_temp.dt_assert((select rules->'states'=
    '["normal","reduced","quarantined","excluded"]'::jsonb
    from public.distribution_trust_engine_versions where status='active'),
    'the four canonical states are ordered and versioned');
  perform pg_temp.dt_assert((select count(*)=16 from public.distribution_trust_reason_registry
    where enabled),'the structured v1 reason registry is complete');
  perform pg_temp.dt_assert(not has_function_privilege('anon',
    'public.distribution_trust_evaluate_content_v1(uuid,timestamp with time zone,text)','EXECUTE')
    and not has_function_privilege('authenticated',
    'public.distribution_trust_evaluate_content_v1(uuid,timestamp with time zone,text)','EXECUTE')
    and has_function_privilege('service_role',
    'public.distribution_trust_evaluate_content_v1(uuid,timestamp with time zone,text)','EXECUTE'),
    'automatic evaluation is service-only');
  perform pg_temp.dt_assert(not has_table_privilege('anon','public.distribution_trust_states','SELECT')
    and not has_table_privilege('authenticated','public.distribution_trust_states','SELECT'),
    'private Distribution evidence is not directly client-readable');
  perform pg_temp.dt_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'distribution_trust_%'
      and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=%'),
    'every SECURITY DEFINER function has an explicit search_path');

  perform pg_temp.dt_set_actor(v_normal);
  begin
    perform public.distribution_trust_set_override_v1(
      pg_temp.dt_uuid('missing'),'normal','DISTRIBUTION_ADMIN_FORCE_NORMAL',null,null);
    raise exception 'normal_user_override_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.distribution_trust_admin_overview_v1(null,10);
    raise exception 'normal_user_admin_read_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.dt_set_service();
end;
$$;

-- Automatic state transitions consume Account Trust and Review Trust without
-- mutating source content, moderation, enforcement, ranking or visibility.
do $$
declare v_user uuid:=pg_temp.dt_user('automatic');v_admin uuid:=pg_temp.dt_user('appeal-admin',true);
  v_content uuid:=pg_temp.dt_content('automatic',v_user);
  v_case uuid:=pg_temp.dt_uuid('case:automatic');v_result jsonb;v_history integer;v_events integer;
  v_lifecycle text;v_case_status text;v_trust numeric;
begin
  select lifecycle_status into v_lifecycle from public.safety_content_items where id=v_content;
  select trust_score into v_trust from public.account_trust_scores where user_id=v_user;

  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='normal'
    and v_result->'reason_codes' ? 'DISTRIBUTION_DEFAULT_NORMAL',
    'clean content initializes at normal');
  select count(*) into v_history from public.distribution_trust_history where content_item_id=v_content;
  select count(*) into v_events from public.distribution_trust_events where content_item_id=v_content;
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(not (v_result->>'changed')::boolean
    and (select count(*) from public.distribution_trust_history where content_item_id=v_content)=v_history
    and (select count(*) from public.distribution_trust_events where content_item_id=v_content)=v_events,
    'repeated automatic evaluation is idempotent');

  update public.account_trust_scores set risk_level='suspicious',trust_score=40 where user_id=v_user;
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='reduced'
    and v_result->'reason_codes' ? 'DISTRIBUTION_ACCOUNT_SUSPICIOUS',
    'suspicious Account Trust recommends reduced distribution only');
  update public.account_trust_scores set risk_level='high_risk',trust_score=10 where user_id=v_user;
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='reduced'
    and v_result->'reason_codes' ? 'DISTRIBUTION_ACCOUNT_HIGH_RISK',
    'Account Trust alone cannot quarantine or exclude content');

  update public.account_trust_scores set risk_level='normal',trust_score=v_trust where user_id=v_user;
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='normal'
    and not (v_result->'reason_codes' ? 'DISTRIBUTION_TRUST_RECOVERED')
    and exists(select 1 from public.distribution_trust_events where content_item_id=v_content
      and event_type='automatically_restored'
      and 'DISTRIBUTION_TRUST_RECOVERED'=any(reason_codes)),
    'expired or cleared Trust inputs restore automatically with a durable transition reason');
  v_history:=(select count(*) from public.distribution_trust_history where content_item_id=v_content);
  perform public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert((select count(*) from public.distribution_trust_history
    where content_item_id=v_content)=v_history,
    'restoration reason does not create an idempotency loop');

  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(v_case,v_content,'needs_review',60);
  insert into public.safety_signals(case_id,signal_type,provider,categories,scores,flagged)
  values(v_case,'review_integrity_near_duplicate','backyrd_integrity',
    '{"risk_level":"suspicious"}','{"integrity_score":0.72}',true);
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='reduced'
    and v_result->'reason_codes' ? 'DISTRIBUTION_REVIEW_INTEGRITY_SUSPICIOUS',
    'unresolved suspicious Review Integrity recommends reduced distribution');
  update public.safety_signals set categories='{"risk_level":"high_risk"}' where case_id=v_case;
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='quarantined'
    and v_result->'reason_codes' ? 'DISTRIBUTION_REVIEW_INTEGRITY_HIGH_RISK',
    'unresolved high-risk Review Integrity recommends quarantine, not removal');

  update public.safety_cases set case_status='decided',final_action='allow',decision_source='appeal_human',
    decided_by=v_admin,decided_at=now()
    where id=v_case;
  insert into public.safety_decision_events(
    case_id,action,category,severity,confidence,source,reason_codes,actor_user_id,created_at
  ) values(v_case,'allow','none',0,1,'appeal_human',array['HUMAN_REVIEW'],v_admin,now());
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='normal'
    and v_result->'reason_codes' ? 'DISTRIBUTION_APPEAL_RESTORED',
    'a successful human appeal restores automatic distribution');

  select case_status into v_case_status from public.safety_cases where id=v_case;
  perform pg_temp.dt_assert((select lifecycle_status from public.safety_content_items where id=v_content)=v_lifecycle
    and v_case_status='decided'
    and (select trust_score from public.account_trust_scores where user_id=v_user)=v_trust,
    'Distribution evaluation never mutates content, moderation or Account Trust');
end;
$$;

-- Confirmed human outcomes are inputs to Distribution, while the Distribution
-- engine remains separate from the Safety decision itself.
do $$
declare v_user uuid:=pg_temp.dt_user('human-outcome');v_content uuid:=pg_temp.dt_content('human-outcome',v_user);
  v_case uuid:=pg_temp.dt_uuid('case:human-outcome');v_result jsonb;v_base timestamptz:=now()-interval '10 minutes';
begin
  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(v_case,v_content,'decided',50);
  insert into public.safety_decision_events(case_id,action,source,reason_codes,created_at)
  values(v_case,'limit','human_admin',array['HUMAN_REVIEW'],v_base+interval '1 minute');
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='reduced','human LIMIT maps to reduced');
  insert into public.safety_decision_events(case_id,action,source,reason_codes,created_at)
  values(v_case,'temporary_hide','human_admin',array['HUMAN_REVIEW'],v_base+interval '2 minutes');
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='quarantined','human TEMPORARY_HIDE maps to quarantine');
  insert into public.safety_decision_events(case_id,action,source,reason_codes,created_at)
  values(v_case,'remove','human_admin',array['HUMAN_REVIEW'],v_base+interval '3 minutes');
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='excluded'
    and (select lifecycle_status='live' from public.safety_content_items where id=v_content),
    'human REMOVE maps to distribution exclusion without deleting or hiding source content');
  insert into public.safety_decision_events(case_id,action,source,reason_codes,created_at)
  values(v_case,'allow','human_admin',array['HUMAN_REVIEW'],v_base+interval '4 minutes');
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='normal','later human ALLOW is reversible');
end;
$$;

-- Authorized manual overrides always win, are versioned and can return to the
-- live automatic recommendation. Expiry restores without human intervention.
do $$
declare v_admin uuid:=pg_temp.dt_user('admin',true);v_user uuid:=pg_temp.dt_user('override-user');
  v_content uuid:=pg_temp.dt_content('override',v_user);v_result jsonb;v_override uuid;
  v_event_count integer;v_version bigint;
begin
  update public.account_trust_scores set risk_level='suspicious',trust_score=40 where user_id=v_user;
  perform public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  update public.profiles set is_admin=true where id=v_admin;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_admin,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform pg_temp.dt_assert(auth.uid()=v_admin
    and public.safety_is_admin_v1(v_admin),
    'synthetic Admin identity is authorized before override tests');

  v_result:=public.distribution_trust_set_override_v1(v_content,'normal',
    'DISTRIBUTION_ADMIN_FORCE_NORMAL','Human review cleared temporary concern.',null);
  perform pg_temp.dt_assert(v_result->>'automatic_state'='reduced'
    and v_result->>'effective_state'='normal','force-normal overrides automatic reduction');
  v_result:=public.distribution_trust_set_override_v1(v_content,'reduced',
    'DISTRIBUTION_ADMIN_FORCE_REDUCED','Temporary confidence adjustment.',null);
  perform pg_temp.dt_assert(v_result->>'effective_state'='reduced','force-reduced is supported');
  v_result:=public.distribution_trust_set_override_v1(v_content,'quarantined',
    'DISTRIBUTION_ADMIN_FORCE_QUARANTINED','Pending accountable human review.',null);
  perform pg_temp.dt_assert(v_result->>'effective_state'='quarantined','force-quarantine is supported');
  v_result:=public.distribution_trust_set_override_v1(v_content,'excluded',
    'DISTRIBUTION_ADMIN_FORCE_EXCLUDED','Confirmed distribution-only decision.',null);
  v_override:=(v_result->>'override_id')::uuid;
  v_event_count:=(select count(*) from public.distribution_trust_events where content_item_id=v_content);
  v_version:=(select state_version from public.distribution_trust_states where content_item_id=v_content);
  v_result:=public.distribution_trust_set_override_v1(v_content,'excluded',
    'DISTRIBUTION_ADMIN_FORCE_EXCLUDED','Confirmed distribution-only decision.',null);
  perform pg_temp.dt_assert((v_result->>'duplicate')::boolean
    and (v_result->>'override_id')::uuid=v_override
    and (select count(*) from public.distribution_trust_events where content_item_id=v_content)=v_event_count
    and (select state_version from public.distribution_trust_states where content_item_id=v_content)=v_version,
    'repeated identical override is idempotent');

  v_result:=public.distribution_trust_release_override_v1(v_content,'Return to automatic evaluation.');
  perform pg_temp.dt_assert(v_result->>'effective_state'='reduced'
    and v_result->>'automatic_state'='reduced'
    and exists(select 1 from public.distribution_trust_overrides where id=v_override
      and status='released' and released_by=v_admin),
    'manual release returns to the current automatic recommendation');

  update public.account_trust_scores set risk_level='normal',trust_score=60 where user_id=v_user;
  perform public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  v_result:=public.distribution_trust_set_override_v1(v_content,'quarantined',
    'DISTRIBUTION_ADMIN_FORCE_QUARANTINED','Time-bounded review.',now()+interval '1 minute');
  v_override:=(v_result->>'override_id')::uuid;
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now()+interval '2 minutes','automatic');
  perform pg_temp.dt_assert(v_result->>'effective_state'='normal'
    and exists(select 1 from public.distribution_trust_overrides where id=v_override and status='expired')
    and exists(select 1 from public.distribution_trust_events where override_id=v_override
      and event_type='override_expired' and source='system'),
    'expired override restores automatic distribution');

  perform pg_temp.dt_assert((select count(*)>=4 from public.distribution_trust_history
    where content_item_id=v_content)
    and (select count(*)>=4 from public.distribution_trust_events where content_item_id=v_content)
    and not exists(select 1 from public.distribution_trust_history where content_item_id=v_content
      and engine_version<>'distribution-trust-v1'),
    'state, history, events, actor and engine version form a durable audit trail');
  perform pg_temp.dt_assert((public.distribution_trust_admin_detail_v1(v_content)->'state'->>'effective_state')='normal'
    and jsonb_array_length(public.distribution_trust_admin_detail_v1(v_content)->'history')>=4,
    'generic Admin detail exposes state, reasons, overrides and timeline');
end;
$$;

-- Pipeline and non-consumption invariants: detectors can schedule evaluation,
-- but only the central evaluator owns Distribution state and no active product
-- contract consumes it in the foundation sprint.
do $$
begin
  perform pg_temp.dt_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname like 'account_trust_evaluate_%' or p.proname like 'safety_evaluate_review_integrity%')
      and p.prosrc ~* 'distribution_trust_(states|history|overrides|events)'),
    'Review and Account Trust detectors do not bypass the Distribution evaluator');
  perform pg_temp.dt_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname not like 'distribution_trust_%'
      and p.prosrc ~* 'distribution_trust_states'),
    'search, feed, recommendation, ranking and Owner APIs do not consume foundation state');
  perform pg_temp.dt_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'distribution_trust_%'
      and p.prosrc ~* '(update|delete|insert[[:space:]]+into)[[:space:]]+public\.(reviews|moments|spots|safety_account_enforcements|safety_account_measures)'),
    'Distribution Trust has no moderation, enforcement, ranking or visibility side effects');
end;
$$;

rollback;

\echo 'Sprint 10 Distribution Trust foundation acceptance passed.'
