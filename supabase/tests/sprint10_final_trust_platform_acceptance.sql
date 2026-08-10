\set ON_ERROR_STOP on

begin;

create function pg_temp.tf_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.tf_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Final Trust Platform acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.tf_user(p_label text,p_admin boolean default false) returns uuid
language plpgsql as $$
declare v_id uuid:=pg_temp.tf_uuid('user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@trust-final.invalid','',now(),'{}','{}',now()-interval '400 days',now(),'','','',''
  );
  update public.profiles set is_admin=p_admin where id=v_id;
  if p_admin then
    insert into public.admin_users(user_id,role) values(v_id,'super_admin') on conflict do nothing;
  end if;
  insert into public.account_trust_scores(
    user_id,engine_version,trust_score,risk_level,dimension_scores,reason_codes,active_signal_count
  ) select v_id,version,60,'normal',
    '{"identity":60,"behaviour":60,"network":60,"security":60,"owner":60,"reputation":60}',
    array[]::text[],0
  from public.account_trust_engine_versions where status='active'
  on conflict(user_id) do nothing;
  return v_id;
end;
$$;

create function pg_temp.tf_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

create function pg_temp.tf_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
end;
$$;

create function pg_temp.tf_spot(p_label text,p_owner uuid,p_category uuid,p_city text default 'Trust Final')
returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.tf_uuid('spot:'||p_label);
begin
  insert into public.spots(id,name,address,lat,lng,created_by,owner_id,status,category_id,city)
  values(v_id,'Trust Final '||p_label,'Acceptance 1',47.55,7.59,p_owner,p_owner,'approved',p_category,p_city);
  return v_id;
end;
$$;

create function pg_temp.tf_content(p_spot uuid) returns uuid language sql stable as $$
  select id from public.safety_content_items where entity_type='spot' and entity_id=p_spot;
$$;

create function pg_temp.tf_integrity_context(p_content uuid,p_label text)
returns uuid language plpgsql as $$
declare v_case uuid:=pg_temp.tf_uuid('case:'||p_label);
begin
  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(v_case,p_content,'queued',40);
  set local session_replication_role=replica;
  insert into public.safety_signals(case_id,signal_type,provider,categories,scores,flagged)
  values(v_case,'review_integrity_near_duplicate','backyrd_integrity',
    '{"risk_level":"suspicious"}','{"integrity_score":0.72}',true);
  set local session_replication_role=origin;
  return v_case;
end;
$$;

-- Canonical pipeline, privacy and absence of parallel policy implementations.
do $$
begin
  perform pg_temp.tf_assert((select count(*)=1 from public.distribution_trust_engine_versions
    where status='active' and version='distribution-trust-v2'),'one canonical Distribution engine is active');
  perform pg_temp.tf_assert((select count(*)=14 from public.distribution_trust_policy_rules
    where engine_version='distribution-trust-v2' and enabled),'one complete canonical policy matrix exists');
  perform pg_temp.tf_assert(not has_table_privilege('anon','public.distribution_trust_states','SELECT')
    and not has_table_privilege('authenticated','public.distribution_trust_states','SELECT')
    and not has_table_privilege('anon','public.account_trust_scores','SELECT'),
    'private Trust scores, evidence and states are not client-readable');
  perform pg_temp.tf_assert((select pg_get_function_result(p.oid)=
      'TABLE(entity_id uuid, eligible boolean, distribution_priority integer)'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='distribution_trust_filter_entities_v1'),
    'the public consumer boundary exposes eligibility only');
  perform pg_temp.tf_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname not like 'distribution_trust_%'
      and p.prosrc~'distribution_trust_(states|history|overrides|policy_rules)'),
    'SQL consumers do not bypass the canonical Distribution boundary');
end;
$$;

-- Expiring override: the exact expiry survives an earlier unrelated cron run,
-- restores automatically, remains idempotent and leaves a complete audit.
do $$
declare v_admin uuid:=pg_temp.tf_user('expiry-admin',true);
  v_owner uuid:=pg_temp.tf_user('expiry-owner');v_category uuid:=pg_temp.tf_uuid('category:expiry');
  v_spot uuid;v_content uuid;v_expiry timestamptz:=now()+interval '2 minutes';
  v_result jsonb;v_history bigint;v_enforcements bigint;
begin
  insert into public.categories(id,name) values(v_category,'Trust Final Expiry');
  v_spot:=pg_temp.tf_spot('Override Expiry',v_owner,v_category);
  v_content:=pg_temp.tf_content(v_spot);
  select count(*) into v_enforcements from public.safety_enforcement_events;

  perform pg_temp.tf_actor(v_admin);
  v_result:=public.distribution_trust_set_override_v1(v_content,'excluded',
    'DISTRIBUTION_ADMIN_FORCE_EXCLUDED','Final acceptance expiring override.',v_expiry);
  perform pg_temp.tf_assert(v_result->>'effective_state'='excluded','manual override applies');
  perform pg_temp.tf_assert(exists(select 1 from public.distribution_trust_evaluation_queue
    where content_item_id=v_content and next_evaluation_at<=v_expiry),'override expiry is durably scheduled');

  perform pg_temp.tf_service();
  perform public.distribution_trust_evaluate_due_v1(1000,now());
  perform pg_temp.tf_assert(exists(select 1 from public.distribution_trust_evaluation_queue
    where content_item_id=v_content and abs(extract(epoch from(next_evaluation_at-v_expiry)))<1),
    'an earlier cron evaluation preserves the future expiry wake-up');
  perform public.distribution_trust_evaluate_due_v1(1000,v_expiry+interval '1 second');
  perform pg_temp.tf_assert((select effective_state='normal' and active_override_id is null
    from public.distribution_trust_states where content_item_id=v_content),
    'expired override automatically restores canonical policy');
  perform pg_temp.tf_assert((select status='expired' and released_at is not null
    from public.distribution_trust_overrides where content_item_id=v_content),
    'expired override cannot remain orphaned or active');
  perform pg_temp.tf_assert(exists(select 1 from public.distribution_trust_events
    where content_item_id=v_content and event_type='override_expired' and source='system')
    and exists(select 1 from public.distribution_trust_events
    where content_item_id=v_content and event_type='automatically_restored'
      and previous_state='excluded' and new_state='normal'),
    'override expiry and restoration are fully audited');
  select count(*) into v_history from public.distribution_trust_history where content_item_id=v_content;
  perform public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.tf_assert((select count(*)=v_history from public.distribution_trust_history
    where content_item_id=v_content),'repeated restoration is idempotent');
  perform pg_temp.tf_assert((select count(*) from public.safety_enforcement_events)=v_enforcements,
    'Distribution restoration creates no enforcement side effect');
end;
$$;

-- Account signal expiry and simultaneous Account Trust improvement restore all
-- affected content through the shared queue without stale states.
do $$
declare v_owner uuid:=pg_temp.tf_user('account-expiry');v_category uuid:=pg_temp.tf_uuid('category:account');
  v_spots uuid[]:=array[]::uuid[];v_contents uuid[]:=array[]::uuid[];v_spot uuid;v_content uuid;
  v_signal uuid:=pg_temp.tf_uuid('signal:account-expiry');v_label text;v_result jsonb;
begin
  insert into public.categories(id,name) values(v_category,'Trust Final Account');
  foreach v_label in array array['Account A','Account B','Account C'] loop
    v_spot:=pg_temp.tf_spot(v_label,v_owner,v_category);
    v_content:=pg_temp.tf_content(v_spot);
    v_spots:=array_append(v_spots,v_spot);v_contents:=array_append(v_contents,v_content);
    perform pg_temp.tf_integrity_context(v_content,v_label);
  end loop;
  insert into public.account_trust_signals(
    id,user_id,signal_key,dimension,polarity,score_impact,reason_code,definition_version,
    detector_key,detector_version,strength,confidence,deduplication_key,evidence,metadata,
    observed_at,expires_at
  ) select v_signal,v_owner,r.signal_key,r.dimension,r.polarity,-100,r.reason_code,r.definition_version,
    'backyrd.acceptance.expiry','1.0.0',1,1,'final-expiry','{}','{}',now()-interval '1 hour',now()+interval '2 minutes'
  from public.account_trust_signal_registry r where r.signal_key='security_takeover_pattern';
  perform public.account_trust_recalculate_v1(v_owner,v_signal,'final_acceptance_signal_active');
  perform pg_temp.tf_service();
  perform public.distribution_trust_evaluate_due_v1(1000,now());
  perform pg_temp.tf_assert((select count(*)=3 from public.distribution_trust_states
    where content_item_id=any(v_contents) and effective_state='reduced'),
    'aligned Review and temporary Account Trust evidence reduces all affected content');

  update public.account_trust_signals set expires_at=now()-interval '1 second'
  where id=v_signal;
  perform public.account_trust_recalculate_v1(v_owner,v_signal,'final_acceptance_signal_expired');
  perform public.distribution_trust_evaluate_due_v1(1000,now());
  perform pg_temp.tf_assert((select risk_level='normal' from public.account_trust_scores where user_id=v_owner),
    'expired Account Trust signal no longer contributes');
  perform pg_temp.tf_assert((select count(*)=3 from public.distribution_trust_states
    where content_item_id=any(v_contents) and effective_state='normal'),
    'multiple simultaneous Trust improvements restore without stale Distribution state');
  perform pg_temp.tf_assert((select count(*)=3 from public.distribution_trust_events
    where content_item_id=any(v_contents) and event_type='automatically_restored'),
    'every simultaneous restoration remains individually auditable');
end;
$$;

-- Review Trust improvement, human clearance, appeal-triggered scheduling,
-- return-to-auto and superseding overrides all converge on current policy.
do $$
declare v_admin uuid:=pg_temp.tf_user('lifecycle-admin',true);
  v_owner uuid:=pg_temp.tf_user('lifecycle-owner');v_category uuid:=pg_temp.tf_uuid('category:lifecycle');
  v_spot uuid;v_content uuid;v_case uuid;v_result jsonb;v_first_override uuid;
begin
  insert into public.categories(id,name) values(v_category,'Trust Final Lifecycle');
  v_spot:=pg_temp.tf_spot('Lifecycle',v_owner,v_category);v_content:=pg_temp.tf_content(v_spot);
  v_case:=pg_temp.tf_integrity_context(v_content,'lifecycle');
  update public.account_trust_scores set trust_score=20,risk_level='high_risk' where user_id=v_owner;
  perform pg_temp.tf_service();
  v_result:=public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  perform pg_temp.tf_assert(v_result->>'effective_state'='reduced','combined Review and Account context is reduced');

  update public.safety_cases set case_status='decided',final_action='allow',decision_source='human_admin',
    decided_by=v_admin,decided_at=now() where id=v_case;
  insert into public.safety_decision_events(case_id,action,source,reason_codes,actor_user_id)
  values(v_case,'allow','human_admin',array['HUMAN_REVIEW'],v_admin);
  perform public.distribution_trust_evaluate_due_v1(1000,now());
  perform pg_temp.tf_assert((select effective_state='normal' from public.distribution_trust_states
    where content_item_id=v_content),'human clearance and improved Review Trust restore distribution');

  perform pg_temp.tf_actor(v_admin);
  v_result:=public.distribution_trust_set_override_v1(v_content,'reduced',
    'DISTRIBUTION_ADMIN_FORCE_REDUCED','First override.',null);
  v_first_override:=(v_result->>'override_id')::uuid;
  v_result:=public.distribution_trust_set_override_v1(v_content,'quarantined',
    'DISTRIBUTION_ADMIN_FORCE_QUARANTINED','Superseding override.',null);
  perform pg_temp.tf_assert((select status='superseded' from public.distribution_trust_overrides
    where id=v_first_override) and v_result->>'effective_state'='quarantined',
    'conflicting override loop has exactly one accountable winner');
  perform pg_temp.tf_assert((select count(*)=1 from public.distribution_trust_overrides
    where content_item_id=v_content and status='active'),'only one active override can exist');
  v_result:=public.distribution_trust_release_override_v1(v_content,'Final acceptance return to auto.');
  perform pg_temp.tf_assert(v_result->>'effective_state'='normal'
    and v_result->>'automatic_state'='normal','return-to-auto resumes current policy');
  v_result:=public.distribution_trust_release_override_v1(v_content,'Repeated return to auto.');
  perform pg_temp.tf_assert((v_result->>'duplicate')::boolean,'repeated return-to-auto is idempotent');
end;
$$;

-- Consumer state matrix, safe failure, Owner/Admin continuity and restoration
-- re-entry. A platform with no eligible content fails closed without exposing
-- private Trust state; it never reintroduces quarantined content.
do $$
declare v_owner uuid:=pg_temp.tf_user('consumer-owner');v_admin uuid:=pg_temp.tf_user('consumer-admin',true);
  v_category uuid:=pg_temp.tf_uuid('category:consumer');v_normal uuid;v_reduced uuid;v_q uuid;v_x uuid;
  c_reduced uuid;c_q uuid;c_x uuid;v_surface text;v_health jsonb;
begin
  insert into public.categories(id,name) values(v_category,'Trust Final Consumers');
  v_normal:=pg_temp.tf_spot('Consumer Normal',v_owner,v_category,'Consumer City');
  v_reduced:=pg_temp.tf_spot('Consumer Reduced',v_owner,v_category,'Consumer City');
  v_q:=pg_temp.tf_spot('Consumer Quarantine',v_owner,v_category,'Consumer City');
  v_x:=pg_temp.tf_spot('Consumer Excluded',v_owner,v_category,'Consumer City');
  c_reduced:=pg_temp.tf_content(v_reduced);c_q:=pg_temp.tf_content(v_q);c_x:=pg_temp.tf_content(v_x);
  perform pg_temp.tf_actor(v_admin);
  perform public.distribution_trust_set_override_v1(c_reduced,'reduced','DISTRIBUTION_ADMIN_FORCE_REDUCED','Matrix.',null);
  perform public.distribution_trust_set_override_v1(c_q,'quarantined','DISTRIBUTION_ADMIN_FORCE_QUARANTINED','Matrix.',null);
  perform public.distribution_trust_set_override_v1(c_x,'excluded','DISTRIBUTION_ADMIN_FORCE_EXCLUDED','Matrix.',null);
  foreach v_surface in array array['decision','search','discovery','feed','maps'] loop
    perform pg_temp.tf_assert((select count(*)=2 from public.distribution_trust_filter_entities_v1(
      'spot',array[v_normal,v_reduced,v_q,v_x],v_surface) where eligible),
      v_surface||' obeys the canonical state matrix');
  end loop;
  perform pg_temp.tf_assert((select count(*)=4 from public.distribution_trust_filter_entities_v1(
    'spot',array[v_normal,v_reduced,v_q,v_x],'owner') where eligible),
    'Owner management remains available for every Distribution state');
  perform pg_temp.tf_assert((select count(*)=2 from public.distribution_trust_spot_catalog_v1(
    null,'Consumer City',100,'search')),'Search safely replaces ineligible candidates');

  perform public.distribution_trust_set_override_v1(pg_temp.tf_content(v_normal),'quarantined',
    'DISTRIBUTION_ADMIN_FORCE_QUARANTINED','All candidate failure simulation.',null);
  perform public.distribution_trust_set_override_v1(c_reduced,'excluded',
    'DISTRIBUTION_ADMIN_FORCE_EXCLUDED','All candidate failure simulation.',null);
  perform pg_temp.tf_assert((select count(*)=0 from public.distribution_trust_spot_catalog_v1(
    null,'Consumer City',100,'search')),'all-ineligible pool fails closed without bypass');
  perform pg_temp.tf_assert((select count(*)=4 from public.distribution_trust_spot_catalog_v1(
    null,'Consumer City',100,'owner')),'Owner surface remains functional during public safe fallback');

  v_health:=public.founder_distribution_health_v1();
  perform pg_temp.tf_assert(v_health->>'engine_version'='distribution-trust-v2'
    and v_health?'states' and v_health?'overdue_evaluations'
    and v_health?'expired_active_overrides' and v_health?'admin_events_missing_actor',
    'Founder receives current Distribution health and audit-gap status');
  perform pg_temp.tf_assert((v_health->>'admin_events_missing_actor')::bigint=0,
    'fresh canonical Distribution audit has no admin events without actors');
  perform pg_temp.tf_assert((public.distribution_trust_admin_detail_v1(c_q)->'affected_consumers')
    @>'["decision","search","discovery","feed","maps"]','Admin sees affected consumers and audit');
end;
$$;

-- Audit completeness, durable recovery infrastructure and privacy-safe Founder
-- data. Automatic events need no actor; every human event must have one.
do $$
declare v_admin uuid:=pg_temp.tf_user('audit-admin',true);v_normal uuid:=pg_temp.tf_user('audit-normal');
  v_health jsonb;v_denied boolean:=false;
begin
  perform pg_temp.tf_assert(not exists(select 1 from public.distribution_trust_history
    where automatic_state is null or effective_state is null or transition_source is null
      or engine_version is null or state_version is null or created_at is null),
    'every state change has complete versioned history');
  perform pg_temp.tf_assert(not exists(select 1 from public.distribution_trust_events
    where event_type is null or source is null or reason_codes is null
      or engine_version is null or created_at is null
      or (source='admin' and actor_user_id is null)),
    'every Distribution event has reason, source, time, engine and human actor where required');
  perform pg_temp.tf_assert((select relpersistence='p' from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='distribution_trust_evaluation_queue'),
    'restart-safe evaluation queue is persistent');
  perform pg_temp.tf_assert((select prosrc like '%for update skip locked%'
      and prosrc like '%attempt_count=attempt_count+1%'
      and prosrc like '%override_expiry%'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='distribution_trust_evaluate_due_v1'),
    'parallel workers, cron interruption retry and expiry rescheduling are explicit');

  perform pg_temp.tf_actor(v_normal);
  begin perform public.founder_distribution_health_v1();
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.tf_assert(v_denied,'Founder Distribution health is admin-only');
  perform pg_temp.tf_actor(v_admin);
  v_health:=public.founder_trust_health_v1();
  perform pg_temp.tf_assert(v_health?'distribution'
    and v_health->'distribution'->>'engine_version'='distribution-trust-v2',
    'Founder Trust health includes current Distribution health without stale copied data');
end;
$$;

-- Conservative isolated performance budgets. These guard against accidental
-- order-of-magnitude regressions rather than pretending CI equals Production.
do $$
declare v_owner uuid:=pg_temp.tf_user('performance-owner');v_category uuid:=pg_temp.tf_uuid('category:performance');
  v_ids uuid[]:=array[]::uuid[];v_id uuid;v_start timestamptz;v_filter_ms numeric;
  v_decision_ms numeric;v_search_ms numeric;v_discovery_ms numeric;v_maps_ms numeric;v_feed_ms numeric;
  i integer;
begin
  insert into public.categories(id,name) values(v_category,'Trust Final Performance');
  for i in 1..60 loop
    v_id:=pg_temp.tf_spot('Performance '||i,v_owner,v_category,'Performance City');
    v_ids:=array_append(v_ids,v_id);
  end loop;
  perform pg_temp.tf_service();
  perform public.distribution_trust_evaluate_due_v1(1000,now());

  v_start:=clock_timestamp();
  for i in 1..100 loop perform count(*) from public.distribution_trust_filter_entities_v1('spot',v_ids,'search'); end loop;
  v_filter_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  v_start:=clock_timestamp();perform count(*) from public.backyrd_get_decision_spots_v11('Performance City',null,null,10);v_decision_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  v_start:=clock_timestamp();perform count(*) from public.distribution_trust_spot_catalog_v1(null,'Performance City',100,'search');v_search_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  v_start:=clock_timestamp();perform public.get_discovery_overview_v1();v_discovery_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  v_start:=clock_timestamp();perform count(*) from public.distribution_trust_spot_catalog_v1(null,'Performance City',100,'maps');v_maps_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;
  perform pg_temp.tf_actor(v_owner);
  v_start:=clock_timestamp();perform count(*) from public.get_social_feed_v2(30,null,null,'for_you');v_feed_ms:=extract(epoch from(clock_timestamp()-v_start))*1000;

  raise notice 'Trust performance ms: filter_100=% decision=% search=% discovery=% maps=% feed=%',
    round(v_filter_ms,2),round(v_decision_ms,2),round(v_search_ms,2),round(v_discovery_ms,2),round(v_maps_ms,2),round(v_feed_ms,2);
  perform pg_temp.tf_assert(v_filter_ms<5000 and v_decision_ms<5000 and v_search_ms<5000
    and v_discovery_ms<5000 and v_maps_ms<5000 and v_feed_ms<5000,
    'isolated consumer latency remains inside conservative regression budgets');
end;
$$;

rollback;

\echo 'Sprint 10 final Trust Platform acceptance passed.'
