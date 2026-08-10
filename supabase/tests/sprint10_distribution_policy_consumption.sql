\set ON_ERROR_STOP on

begin;

create function pg_temp.dpc_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.dpc_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 10 policy/consumption acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.dpc_user(p_label text,p_admin boolean default false) returns uuid
language plpgsql as $$
declare v_id uuid:=pg_temp.dpc_uuid('user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,
    raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@distribution.invalid','','{}','{}',now()-interval '400 days',now(),'','','',''
  );
  update public.profiles set is_admin=p_admin where id=v_id;
  insert into public.account_trust_scores(
    user_id,engine_version,trust_score,risk_level,dimension_scores,reason_codes,active_signal_count
  )
  select v_id,version,60,'normal',
    '{"identity":60,"behaviour":60,"network":60,"security":60,"owner":60,"reputation":60}'::jsonb,
    array[]::text[],0
  from public.account_trust_engine_versions where status='active'
  on conflict(user_id) do nothing;
  return v_id;
end;
$$;

create function pg_temp.dpc_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

create function pg_temp.dpc_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
end;
$$;

create function pg_temp.dpc_spot(p_label text,p_owner uuid,p_category uuid) returns uuid
language plpgsql as $$
declare v_id uuid:=pg_temp.dpc_uuid('spot:'||p_label);
begin
  insert into public.spots(id,name,address,lat,lng,created_by,owner_id,status,category_id,city)
  values(v_id,'Distribution '||p_label,'Teststrasse 1',47.55,7.59,p_owner,p_owner,'approved',p_category,'Basel');
  return v_id;
end;
$$;

create function pg_temp.dpc_content(p_spot uuid) returns uuid language sql stable as $$
  select id from public.safety_content_items where entity_type='spot' and entity_id=p_spot;
$$;

-- Policy registry is data-driven, versioned, deterministic and protected.
do $$
begin
  perform pg_temp.dpc_assert((select count(*)=1 from public.distribution_trust_engine_versions
    where status='active' and version='distribution-trust-v2'),'v2 is the only active policy version');
  perform pg_temp.dpc_assert((select count(*)=14 from public.distribution_trust_policy_rules
    where engine_version='distribution-trust-v2' and enabled),'the complete v2 policy matrix is registered');
  perform pg_temp.dpc_assert(public.distribution_trust_policy_evaluate_v1(
    '{"pending_human_review":true,"human_action":"remove"}'::jsonb)->>'state'='excluded',
    'confirmed restrictive human outcomes override automated uncertainty');
  perform pg_temp.dpc_assert(not has_table_privilege('anon','public.distribution_trust_policy_rules','SELECT')
    and not has_table_privilege('authenticated','public.distribution_trust_policy_rules','SELECT'),
    'private policy internals are not client-readable');
  perform pg_temp.dpc_assert(has_function_privilege('anon',
    'public.distribution_trust_filter_entities_v1(text,uuid[],text)','EXECUTE')
    and not has_function_privilege('anon','public.distribution_trust_policy_evaluate_v1(jsonb)','EXECUTE'),
    'clients receive eligibility but cannot execute or inspect policy internals');
end;
$$;

-- Four states, combinations, human outcomes, appeals, overrides and consumer matrix.
do $$
declare
  v_owner uuid:=pg_temp.dpc_user('owner');
  v_admin uuid:=pg_temp.dpc_user('admin',true);
  v_category uuid:=pg_temp.dpc_uuid('category');
  v_normal uuid;v_reduced uuid;v_quarantine uuid;v_excluded uuid;
  c_reduced uuid;c_quarantine uuid;c_excluded uuid;
  case_quarantine uuid:=pg_temp.dpc_uuid('case:quarantine');
  case_excluded uuid:=pg_temp.dpc_uuid('case:excluded');
  v_appeal uuid:=pg_temp.dpc_uuid('appeal:quarantine');
  v_result jsonb;v_history bigint;v_source_status public.spot_status;
  v_surface text;v_open record;
begin
  insert into public.categories(id,name) values(v_category,'Distribution Tests');
  v_normal:=pg_temp.dpc_spot('Normal',v_owner,v_category);
  v_reduced:=pg_temp.dpc_spot('Reduced',v_owner,v_category);
  v_quarantine:=pg_temp.dpc_spot('Quarantined',v_owner,v_category);
  v_excluded:=pg_temp.dpc_spot('Excluded',v_owner,v_category);
  c_reduced:=pg_temp.dpc_content(v_reduced);
  c_quarantine:=pg_temp.dpc_content(v_quarantine);
  c_excluded:=pg_temp.dpc_content(v_excluded);

  -- A combination of independent unresolved dimensions reduces distribution.
  update public.account_trust_scores set risk_level='suspicious',trust_score=40 where user_id=v_owner;
  perform pg_temp.dpc_assert(
    public.distribution_trust_policy_evaluate_v1(
      '{"integrity_risk":"suspicious","account_risk":"suspicious","pending_human_review":false}'::jsonb
    )->>'state'='reduced',
    'independent suspicious dimensions combine to REDUCED when no human review is pending');
  -- Use an explicit accountable override for the reduced consumer fixture.
  perform pg_temp.dpc_actor(v_admin);
  v_result:=public.distribution_trust_set_override_v1(c_reduced,'reduced',
    'DISTRIBUTION_ADMIN_FORCE_REDUCED','Consumer acceptance fixture.',null);
  perform pg_temp.dpc_assert(v_result->>'effective_state'='reduced'
    and v_result->>'automatic_state'='normal','manual REDUCED supplies the reduced fixture');
  perform pg_temp.dpc_service();

  -- Pending human review always remains temporary quarantine.
  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(case_quarantine,c_quarantine,'needs_review',60);
  v_result:=public.distribution_trust_evaluate_content_v1(c_quarantine,now(),'automatic');
  perform pg_temp.dpc_assert(v_result->>'effective_state'='quarantined'
    and v_result->>'policy_rule'='pending_human_review',
    'pending human review maps to QUARANTINED');

  -- Only a confirmed human outcome excludes.
  insert into public.safety_cases(id,content_item_id,case_status,priority,final_action,decision_source)
  values(case_excluded,c_excluded,'decided',80,'remove','human_admin');
  insert into public.safety_decision_events(case_id,action,source,reason_codes,actor_user_id)
  values(case_excluded,'remove','human_admin',array['HUMAN_REVIEW'],v_admin);
  v_result:=public.distribution_trust_evaluate_content_v1(c_excluded,now(),'automatic');
  perform pg_temp.dpc_assert(v_result->>'effective_state'='excluded'
    and v_result->>'policy_rule'='human_remove','confirmed human REMOVE maps to EXCLUDED');

  foreach v_surface in array array['decision','search','discovery','feed','maps'] loop
    perform pg_temp.dpc_assert((select count(*)=2
      from public.distribution_trust_filter_entities_v1(
        'spot',array[v_normal,v_reduced,v_quarantine,v_excluded],v_surface
      ) where eligible),v_surface||' consumes the same canonical eligibility');
    perform pg_temp.dpc_assert((select distribution_priority=100
      from public.distribution_trust_filter_entities_v1('spot',array[v_normal],v_surface)),
      v_surface||' keeps NORMAL fully eligible');
    perform pg_temp.dpc_assert((select distribution_priority=50
      from public.distribution_trust_filter_entities_v1('spot',array[v_reduced],v_surface)),
      v_surface||' keeps REDUCED eligible at lower priority');
  end loop;
  perform pg_temp.dpc_assert((select count(*)=4 from public.distribution_trust_filter_entities_v1(
    'spot',array[v_normal,v_reduced,v_quarantine,v_excluded],'owner') where eligible),
    'Owner management remains functional for all Distribution states');

  perform pg_temp.dpc_assert((select array_agg(spot_id order by review_count desc)=array[v_normal,v_reduced]
    from public.backyrd_web_city_spots_v1('Basel',10)),
    'Discovery excludes quarantined/excluded Spots and keeps reduced alternatives');
  perform pg_temp.dpc_assert((select count(*)=2 from public.distribution_trust_spot_catalog_v1(
    null,'Basel',100,'maps')),'Maps uses the canonical eligibility boundary');

  -- Override always wins and returning to automatic restores live policy.
  perform pg_temp.dpc_actor(v_admin);
  v_result:=public.distribution_trust_set_override_v1(c_quarantine,'normal',
    'DISTRIBUTION_ADMIN_FORCE_NORMAL','Human reviewed temporary uncertainty.',null);
  perform pg_temp.dpc_assert(v_result->>'effective_state'='normal'
    and v_result->>'automatic_state'='quarantined','manual force-normal wins');
  v_result:=public.distribution_trust_release_override_v1(c_quarantine,'Return to automatic policy.');
  perform pg_temp.dpc_assert(v_result->>'effective_state'='quarantined','return-to-auto restores policy state');

  -- A real human decision followed by a successful appeal restores consumers.
  perform public.safety_admin_decide_user_content_v1(
    case_quarantine,'temporary_hide','none',1,1,
    'Temporarily hidden for accountable review.','Synthetic Distribution test.',
    array['HUMAN_REVIEW','HUMAN_ACTION_TEMPORARY_HIDE']
  );
  insert into public.safety_appeals(
    id,case_id,appellant_user_id,statement,status,appeal_reason,original_action
  ) values(
    v_appeal,case_quarantine,v_owner,'This synthetic appeal provides sufficient review context.',
    'submitted','decision_incorrect','temporary_hide'
  );
  perform public.safety_admin_decide_appeal_v1(
    v_appeal,'overturned','Human review cleared the temporary uncertainty.',null
  );
  -- Restoration is allowed only after every independent review requirement is
  -- cleared. Synthetic Spot registration may have a separate content case.
  for v_open in select id from public.safety_cases
    where content_item_id=c_quarantine and case_status in ('needs_review','appealed')
  loop
    perform public.safety_admin_decide_user_content_v1(
      v_open.id,'allow','none',0,1,'Human review cleared the remaining case.',
      'Synthetic Distribution restoration test.',array['HUMAN_REVIEW','HUMAN_ACTION_ALLOW']
    );
  end loop;
  perform pg_temp.dpc_service();
  v_result:=public.distribution_trust_evaluate_content_v1(c_quarantine,now(),'automatic');
  perform pg_temp.dpc_assert(v_result->>'effective_state'='normal',
    'successful appeal restores NORMAL');
  perform pg_temp.dpc_assert(public.distribution_trust_entity_is_eligible_v1(
    'spot',v_quarantine,'search'),'restored content automatically re-enters consumers');

  v_history:=(select count(*) from public.distribution_trust_history where content_item_id=c_quarantine);
  perform public.distribution_trust_evaluate_content_v1(c_quarantine,now(),'automatic');
  perform pg_temp.dpc_assert((select count(*) from public.distribution_trust_history
    where content_item_id=c_quarantine)=v_history,'re-evaluation is idempotent');

  select status into v_source_status from public.spots where id=v_excluded;
  perform pg_temp.dpc_assert(v_source_status='approved'
    and (select lifecycle_status='live' from public.safety_content_items where id=c_excluded),
    'Distribution exclusion does not moderate, delete, hide or mutate source content');
  perform pg_temp.dpc_actor(v_admin);
  perform pg_temp.dpc_assert((public.distribution_trust_admin_detail_v1(c_quarantine)
    ->'affected_consumers') @> '["decision","search","discovery","feed","maps"]'::jsonb,
    'Admin detail exposes current policy, history and affected consumers');
end;
$$;

-- Every active consumer references the central contract; no consumer embeds
-- policy thresholds or reads private Distribution evidence directly.
do $$
begin
  perform pg_temp.dpc_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('backyrd_get_decision_spots_v11','backyrd_web_city_spots_v1',
        'backyrd_web_top_moments_v1','get_social_feed_v2','get_social_user_posts_v2',
        'distribution_trust_spot_catalog_v1')
      and p.prosrc !~ 'distribution_trust_(filter_entities|entity_is_eligible|entity_priority)'),
    'all canonical SQL consumers call the central Distribution contract');
  perform pg_temp.dpc_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname not like 'distribution_trust_%'
      and p.prosrc ~ 'distribution_trust_(states|history|policy_rules)'),
    'consumers cannot bypass the canonical engine with private table reads');
end;
$$;

rollback;

\echo 'Sprint 10 Distribution Policy and Consumption acceptance passed.'
