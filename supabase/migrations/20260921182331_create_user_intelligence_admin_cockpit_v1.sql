-- Founder/Admin read model for the canonical User Intelligence system.
-- This migration does not add a second profile, reinterpret evidence, or
-- expose raw service tables to clients. Both RPCs re-check administrator
-- authority on every call and return a deliberately minimized projection.

create or replace function public.backyrd_admin_user_intelligence_cockpit_list_v1(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  with users as (
    select
      u.id as user_id,
      u.email,
      p.display_name,
      p.username,
      p.avatar_url,
      p.city,
      u.created_at as registered_at,
      c.status as consent_status,
      c.updated_at as consent_updated_at,
      s.snapshot_id,
      s.source_watermark,
      s.updated_at as snapshot_updated_at,
      snap.runtime_version,
      snap.node_count,
      coalesce(snap.card#>>'{content,knowledgeLevel}',snap.card->>'knowledgeLevel','UNKNOWN') as knowledge_level,
      coalesce((select count(*) from public.backyrd_memory_events_v1 m where m.user_id=u.id),0)::int as memory_event_count,
      coalesce((select count(*) from decision_vnext_private.product_learning_records_v1 l where l.user_id=u.id),0)::int as product_learning_count,
      coalesce((select count(*) from public.decision_sessions d where d.user_id=u.id),0)::int as decision_count,
      coalesce((select count(*) from public.backyrd_user_intelligence_change_ledger_v1 l where l.user_id=u.id),0)::int as profile_change_count,
      (select max(x.at) from (values
        ((select max(m.occurred_at) from public.backyrd_memory_events_v1 m where m.user_id=u.id)),
        ((select max(d.created_at) from public.decision_sessions d where d.user_id=u.id)),
        ((select max(l.created_at) from decision_vnext_private.product_learning_records_v1 l where l.user_id=u.id)),
        (s.updated_at)
      ) x(at)) as last_intelligence_activity
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join lateral (
      select status,updated_at from public.user_consents c
      where c.user_id=u.id and c.purpose_key='personalized_recommendations'
      order by c.updated_at desc limit 1
    ) c on true
    left join public.backyrd_user_intelligence_latest_v1 s on s.user_id=u.id
    left join public.backyrd_user_intelligence_snapshots_v2 snap
      on snap.snapshot_id=s.snapshot_id and snap.user_id=u.id
    where u.deleted_at is null
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',u.email,p.display_name,p.username,p.city,u.id::text) ilike '%'||btrim(p_search)||'%')
  ), enriched as (
    select users.*,
      case
        when consent_status is distinct from 'granted' then 'NO_CONSENT'
        when snapshot_id is null and memory_event_count=0 then 'EMPTY'
        when snapshot_id is null or coalesce(node_count,0)=0 then 'BUILDING'
        when knowledge_level='SUFFICIENT' then 'ESTABLISHED'
        else 'LEARNING'
      end as profile_state,
      least(100,
        (case when consent_status='granted' then 15 else 0 end) +
        (case when snapshot_id is not null then 20 else 0 end) +
        least(30,coalesce(node_count,0)*3) +
        least(20,memory_event_count*2) +
        least(15,product_learning_count)
      )::int as coverage_score
    from users
  ), page as (
    select * from enriched
    order by coalesce(last_intelligence_activity,registered_at) desc,user_id
    limit greatest(1,least(coalesce(p_limit,100),500))
    offset greatest(coalesce(p_offset,0),0)
  )
  select jsonb_build_object(
    'contractVersion','backyrd.admin-user-intelligence-cockpit-list@1.0',
    'generatedAt',clock_timestamp(),
    'summary',jsonb_build_object(
      'users',(select count(*) from enriched),
      'consented',(select count(*) from enriched where consent_status='granted'),
      'withProfile',(select count(*) from enriched where snapshot_id is not null),
      'established',(select count(*) from enriched where profile_state='ESTABLISHED'),
      'memoryEvents',(select coalesce(sum(memory_event_count),0) from enriched),
      'profileChanges',(select coalesce(sum(profile_change_count),0) from enriched)
    ),
    'users',coalesce((select jsonb_agg(to_jsonb(page) order by coalesce(last_intelligence_activity,registered_at) desc,user_id) from page),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.backyrd_admin_user_intelligence_cockpit_detail_v1(
  p_user_id uuid,
  p_limit integer default 200
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;v_limit integer:=greatest(20,least(coalesce(p_limit,200),500));
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id and u.deleted_at is null) then
    raise exception 'user_not_found' using errcode='22023';
  end if;

  with identity as (
    select u.id user_id,u.email,p.display_name,p.username,p.avatar_url,p.city,p.country,u.created_at registered_at
    from auth.users u left join public.profiles p on p.id=u.id where u.id=p_user_id
  ), consent as (
    select c.status,c.document_id,c.granted_at,c.withdrawn_at,c.source,c.app_version,c.updated_at
    from public.user_consents c where c.user_id=p_user_id and c.purpose_key='personalized_recommendations'
    order by c.updated_at desc limit 1
  ), latest as (
    select l.snapshot_id,l.source_watermark,l.updated_at,s.runtime_version,s.input_contract_version,s.source_hash,s.snapshot_hash,s.card,s.node_count,s.created_at
    from public.backyrd_user_intelligence_latest_v1 l
    join public.backyrd_user_intelligence_snapshots_v2 s on s.snapshot_id=l.snapshot_id and s.user_id=l.user_id
    where l.user_id=p_user_id
  ), nodes as (
    select n.node_key,n.node
    from public.backyrd_user_intelligence_snapshot_nodes_v1 n join latest l on l.snapshot_id=n.snapshot_id
  ), node_metrics as (
    select count(*)::int node_count,
      count(*) filter(where coalesce(node#>>'{knowledgeState}',node->>'knowledgeState','') in ('POSITIVE','NEGATIVE','MIXED'))::int established_count,
      count(*) filter(where coalesce(node#>>'{knowledgeState}',node->>'knowledgeState','') like 'HYPOTHESIS_%')::int hypothesis_count,
      count(*) filter(where coalesce((node->>'confidence')::numeric,0)>=.75)::int high_confidence_count,
      count(*) filter(where jsonb_array_length(coalesce(node->'contradictions','[]'::jsonb))>0)::int contradiction_count
    from nodes
  ), memory as (
    select m.id,m.event_type,m.event_class,m.evidence_family,m.occurred_at,m.ingested_at,m.session_id,m.decision_id,m.spot_id,s.name spot_name,
      m.exposure_rank,m.retention_class,m.expires_at,m.supersedes_event_id
    from public.backyrd_memory_events_v1 m left join public.spots s on s.id=m.spot_id
    where m.user_id=p_user_id order by m.occurred_at desc,m.id desc limit v_limit
  ), changes as (
    select l.id,l.node_key,l.reason_code,l.engine_version,l.occurred_at,l.triggering_chain_ids,l.previous_node,l.next_node
    from public.backyrd_user_intelligence_change_ledger_v1 l where l.user_id=p_user_id
    order by l.occurred_at desc,l.id desc limit v_limit
  ), learning as (
    select l.id,l.event_type,l.event_id,l.occurred_at,l.created_at,l.record->>'decisionId' decision_id,
      l.record->>'sessionId' session_id,l.record->>'spotId' spot_id,s.name spot_name,
      l.record->>'semanticDisposition' semantic_disposition,l.generation
    from decision_vnext_private.product_learning_records_v1 l
    left join public.spots s on s.id=(case when l.record->>'spotId' ~ '^[0-9a-f-]{36}$' then (l.record->>'spotId')::uuid else null end)
    where l.user_id=p_user_id order by l.occurred_at desc,l.id desc limit v_limit
  ), decisions as (
    select d.id,d.city,d.created_at,t.current_intent,t.retrieval_funnel,t.final_disposition,t.completed_at,
      coalesce((select count(*) from public.backyrd_memory_events_v1 m where m.user_id=p_user_id and m.decision_id=d.id),0)::int memory_event_count,
      coalesce((select count(*) from decision_vnext_private.product_learning_records_v1 l where l.user_id=p_user_id and l.record->>'decisionId'=d.id::text),0)::int learning_event_count,
      coalesce((select count(*) from public.backyrd_user_intelligence_change_ledger_v1 c where c.user_id=p_user_id and c.triggering_chain_ids && coalesce((select array_agg(m.id) from public.backyrd_memory_events_v1 m where m.user_id=p_user_id and m.decision_id=d.id),'{}'::uuid[])),0)::int directly_attributed_changes
    from public.decision_sessions d left join public.backyrd_decision_funnel_traces_v1 t on t.decision_id=d.id
    where d.user_id=p_user_id order by d.created_at desc limit 100
  ), work as (
    select state,count(*)::int count,min(created_at) oldest,max(updated_at) latest,
      coalesce(jsonb_object_agg(coalesce(failure_code,'NONE'),failure_count) filter(where failure_code is not null),'{}'::jsonb) failure_codes
    from (
      select w.state,w.created_at,w.updated_at,w.failure_code,count(*) over(partition by w.state,w.failure_code)::int failure_count
      from public.backyrd_user_intelligence_work_v1 w where w.user_id=p_user_id
    ) x group by state
  ), metrics as (
    select
      (select count(*) from memory)::int memory_visible,
      (select count(*) from public.backyrd_memory_events_v1 m where m.user_id=p_user_id)::int memory_total,
      (select count(*) from learning)::int learning_visible,
      (select count(*) from decision_vnext_private.product_learning_records_v1 l where l.user_id=p_user_id)::int learning_total,
      (select count(*) from public.decision_sessions d where d.user_id=p_user_id)::int decisions_total,
      (select count(*) from public.backyrd_user_intelligence_change_ledger_v1 l where l.user_id=p_user_id)::int changes_total
  )
  select jsonb_build_object(
    'contractVersion','backyrd.admin-user-intelligence-cockpit-detail@1.0',
    'generatedAt',clock_timestamp(),
    'user',(select to_jsonb(identity) from identity),
    'consent',coalesce((select to_jsonb(consent) from consent),jsonb_build_object('status','missing')),
    'profile',jsonb_build_object(
      'state',case when coalesce((select status from consent),'missing')<>'granted' then 'NO_CONSENT' when not exists(select 1 from latest) then 'EMPTY' when coalesce((select node_count from node_metrics),0)=0 then 'BUILDING' when coalesce((select card#>>'{content,knowledgeLevel}' from latest),(select card->>'knowledgeLevel' from latest),'UNKNOWN')='SUFFICIENT' then 'ESTABLISHED' else 'LEARNING' end,
      'snapshot',coalesce((select jsonb_build_object('snapshotId',snapshot_id,'sourceWatermark',source_watermark,'updatedAt',updated_at,'runtimeVersion',runtime_version,'inputContractVersion',input_contract_version,'sourceHash',source_hash,'snapshotHash',snapshot_hash,'createdAt',created_at,'card',card) from latest),'null'::jsonb),
      'metrics',coalesce((select to_jsonb(node_metrics) from node_metrics),jsonb_build_object('node_count',0,'established_count',0,'hypothesis_count',0,'high_confidence_count',0,'contradiction_count',0)),
      'nodes',coalesce((select jsonb_agg(jsonb_build_object('nodeKey',node_key,'node',node) order by node_key) from nodes),'[]'::jsonb)
    ),
    'gaps',jsonb_strip_nulls(jsonb_build_object(
      'consent',case when coalesce((select status from consent),'missing')<>'granted' then 'Personalisierungs-Consent fehlt; es darf kein Profil aufgebaut werden.' end,
      'snapshot',case when not exists(select 1 from latest) and (select status from consent)='granted' then 'Noch kein kanonischer Snapshot; neue zulässige Evidenz muss verarbeitet werden.' end,
      'taste',case when coalesce((select node_count from node_metrics),0)=0 and exists(select 1 from latest) then 'Noch keine belastbaren Taste-Knoten im aktuellen Snapshot.' end,
      'hypotheses',case when coalesce((select hypothesis_count from node_metrics),0)>0 then (select hypothesis_count from node_metrics)||' Hypothesen benötigen weitere unabhängige, konsistente Evidenz.' end,
      'contradictions',case when coalesce((select contradiction_count from node_metrics),0)>0 then (select contradiction_count from node_metrics)||' Knoten enthalten widersprüchliche Evidenz.' end,
      'directSignals',case when (select learning_total from metrics)=0 then 'Noch keine Product-v1-Learning-Ereignisse aufgezeichnet.' end
    )),
    'totals',(select to_jsonb(metrics) from metrics),
    'decisions',coalesce((select jsonb_agg(to_jsonb(decisions) order by created_at desc) from decisions),'[]'::jsonb),
    'memory',coalesce((select jsonb_agg(to_jsonb(memory) order by occurred_at desc) from memory),'[]'::jsonb),
    'learning',coalesce((select jsonb_agg(to_jsonb(learning) order by occurred_at desc) from learning),'[]'::jsonb),
    'changes',coalesce((select jsonb_agg(to_jsonb(changes) order by occurred_at desc) from changes),'[]'::jsonb),
    'work',coalesce((select jsonb_agg(to_jsonb(work) order by state) from work),'[]'::jsonb),
    'privacy',jsonb_build_object('rawDecisionTextIncluded',false,'rawTokensIncluded',false,'serviceCredentialsIncluded',false,'adminAuthorityRequired',true)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.backyrd_admin_user_intelligence_cockpit_list_v1(text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.backyrd_admin_user_intelligence_cockpit_detail_v1(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.backyrd_admin_user_intelligence_cockpit_list_v1(text,integer,integer) to authenticated,service_role;
grant execute on function public.backyrd_admin_user_intelligence_cockpit_detail_v1(uuid,integer) to authenticated,service_role;

comment on function public.backyrd_admin_user_intelligence_cockpit_list_v1(text,integer,integer) is
  'Admin-only minimized operational index over canonical User Intelligence. No raw Decision text or service credentials.';
comment on function public.backyrd_admin_user_intelligence_cockpit_detail_v1(uuid,integer) is
  'Admin-only traceable User Intelligence detail: consent, snapshot, canonical nodes, decisions, learning, changes and processing health.';
