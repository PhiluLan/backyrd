-- Founder Product Cockpit v2.
--
-- This is an admin-only, read-only projection over the canonical Product v1
-- runtime. It deliberately does not infer failed Edge requests from missing
-- rows: successful evaluations are measured from sealed idempotency records,
-- while error telemetry is reported as unavailable until a canonical error
-- ledger exists. Historical launch scoring remains untouched and archived.

create index if not exists product_idempotency_records_v1_created_product_idx
  on decision_vnext_private.product_idempotency_records_v1(created_at desc)
  where purpose = 'PRODUCT_DECISION_VNEXT_EVALUATION';

create index if not exists product_learning_records_v1_created_idx
  on decision_vnext_private.product_learning_records_v1(created_at desc,event_type);

create or replace function public.founder_live_product_overview_v2()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
  v_control_effective boolean;
  v_product jsonb;
  v_activity jsonb;
  v_world jsonb;
  v_users jsonb;
  v_trust jsonb;
  v_attention jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  select * into strict v_control
  from decision_vnext_private.product_runtime_control_events_v1
  order by generation desc
  limit 1;

  v_control_effective := v_control.state='ON'
    and v_control.authority_version='backyrd.decision-vnext.product-activation-authority@1.0'
    and v_control.authority_expires_at is not null
    and v_control.authority_expires_at>v_now;

  v_product := pg_catalog.jsonb_build_object(
    'effectiveState',case when v_control_effective then 'ON' else 'OFF' end,
    'recordedState',v_control.state,
    'killSwitchEngaged',not v_control_effective,
    'generation',v_control.generation,
    'route','decision-v13',
    'engine','DECISION_VNEXT_PRODUCT_V1',
    'singleRoute',true,
    'legacyFallback',false,
    'releaseHash',v_control.release_hash,
    'artifactHash',v_control.artifact_hash,
    'sourceSetHash',v_control.source_set_hash,
    'authorityVersion',v_control.authority_version,
    'authorityExpiresAt',v_control.authority_expires_at,
    'reasonCode',v_control.reason_code,
    'changedAt',v_control.created_at
  );

  with product_rows as materialized (
    select r.auth_user_id,r.created_at,r.generation,r.release_hash,r.artifact_hash,r.source_set_hash,
      r.response_envelope_bytes::jsonb as envelope
    from decision_vnext_private.product_idempotency_records_v1 r
    where r.purpose='PRODUCT_DECISION_VNEXT_EVALUATION'
  ), measured as (
    select
      count(*) filter(where created_at>=v_now-interval '24 hours')::integer successes_24h,
      count(distinct auth_user_id) filter(where created_at>=v_now-interval '24 hours')::integer users_24h,
      count(*) filter(where created_at>=v_now-interval '24 hours'
        and pg_catalog.jsonb_array_length(coalesce(envelope#>'{response,candidates}','[]'::jsonb))=0)::integer zero_result_24h,
      count(*) filter(where created_at>=v_now-interval '24 hours'
        and coalesce(envelope#>>'{response,personalization,state}','NEUTRAL')='ACTIVE')::integer personalized_24h,
      max(created_at) as last_success_at,
      max(created_at) filter(where release_hash=v_control.release_hash
        and generation=v_control.generation
        and artifact_hash=v_control.artifact_hash
        and source_set_hash=v_control.source_set_hash) as last_bound_success_at
    from product_rows
  )
  select pg_catalog.jsonb_build_object(
    'measurementWindowHours',24,
    'successfulDecisions24h',successes_24h,
    'activeDecisionUsers24h',users_24h,
    'zeroResultDecisions24h',zero_result_24h,
    'zeroResultRate24h',case when successes_24h=0 then null else pg_catalog.round(100.0*zero_result_24h/successes_24h,1) end,
    'personalizedDecisions24h',personalized_24h,
    'lastSuccessfulDecisionAt',last_success_at,
    'lastCurrentBindingSuccessAt',last_bound_success_at,
    'errorTelemetry',pg_catalog.jsonb_build_object(
      'status','NOT_CANONICALLY_AVAILABLE',
      'count24h',null,
      'rate24h',null,
      'explanation','Fehlgeschlagene Edge-Anfragen werden noch nicht in einem kanonischen, personenbezogen minimierten Ledger gespeichert.'
    )
  ) into v_activity from measured;

  with coverage as (
    select
      count(*)::integer approved,
      count(*) filter(where lower(coalesce(s.city,'')) in ('basel','basel-stadt'))::integer approved_basel,
      count(*) filter(where exists(select 1 from world_knowledge_private.claims c where c.spot_id=s.id))::integer with_claims,
      count(*) filter(where exists(select 1 from world_knowledge_private.current_projection_pointers p where p.spot_id=s.id))::integer with_snapshots
    from public.spots s
    where s.status='approved'
  )
  select pg_catalog.jsonb_build_object(
    'approvedSpots',approved,
    'approvedBaselSpots',approved_basel,
    'spotsWithClaims',with_claims,
    'spotsWithCanonicalSnapshot',with_snapshots,
    'spotsWithoutCanonicalSnapshot',approved-with_snapshots,
    'snapshotCoveragePercent',case when approved=0 then 0 else pg_catalog.round(100.0*with_snapshots/approved,1) end,
    'openReviewItems',(select count(*)::integer from world_knowledge_private.review_work_items w where w.status in ('OPEN','IN_REVIEW')),
    'failedRebuilds',(select count(*)::integer from world_knowledge_private.rebuild_jobs j where j.status='FAILED'),
    'lastCanonicalRebuildAt',(select max(p.updated_at) from world_knowledge_private.current_projection_pointers p),
    'adminAuthoringActive',world_knowledge_private.product_admin_authoring_active_v1()
  ) into v_world from coverage;

  with latest_consent as (
    select distinct on (c.user_id) c.user_id,c.status
    from public.user_consents c
    where c.purpose_key='personalized_recommendations'
    order by c.user_id,c.updated_at desc
  )
  select pg_catalog.jsonb_build_object(
    'registeredUsers',(select count(*)::integer from auth.users u where u.deleted_at is null),
    'consentedUsers',(select count(*)::integer from latest_consent c where c.status='granted'),
    'usersWithIntelligenceProfile',(select count(*)::integer from public.backyrd_user_intelligence_latest_v1),
    'learningEvents24h',(select count(*)::integer from decision_vnext_private.product_learning_records_v1 l where l.created_at>=v_now-interval '24 hours'),
    'learningEvents7d',(select count(*)::integer from decision_vnext_private.product_learning_records_v1 l where l.created_at>=v_now-interval '7 days'),
    'lastLearningEventAt',(select max(l.created_at) from decision_vnext_private.product_learning_records_v1 l)
  ) into v_users;

  v_trust := public.founder_trust_health_v1();

  if not v_control_effective then
    v_attention := v_attention||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','CRITICAL','code','PRODUCT_OFF','title','Decision vNext ist nicht wirksam ON',
      'detail','Der Product-Control oder seine zeitlich begrenzte Authority ist OFF beziehungsweise abgelaufen.'
    ));
  elsif v_control.authority_expires_at<=v_now+interval '2 hours' then
    v_attention := v_attention||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','WARNING','code','AUTHORITY_EXPIRING','title','Product-Authority läuft bald ab',
      'detail','Die aktuelle ON-Authority läuft innerhalb der nächsten zwei Stunden ab.'
    ));
  end if;
  if (v_activity->>'lastCurrentBindingSuccessAt') is null
     or (v_activity->>'lastCurrentBindingSuccessAt')::timestamptz<v_now-interval '24 hours' then
    v_attention := v_attention||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','WARNING','code','NO_RECENT_BOUND_DECISION','title','Keine aktuelle gebundene Decision in 24 Stunden',
      'detail','Für die aktive Release-/Artifact-/Generation-Bindung wurde in den letzten 24 Stunden keine erfolgreiche Decision versiegelt.'
    ));
  end if;
  if coalesce((v_world->>'spotsWithoutCanonicalSnapshot')::integer,0)>0 then
    v_attention := v_attention||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','WARNING','code','WORLD_COVERAGE_GAP','title','World Knowledge ist nicht vollständig projiziert',
      'detail',(v_world->>'spotsWithoutCanonicalSnapshot')||' freigegebene Spots besitzen noch keinen kanonischen Snapshot.'
    ));
  end if;
  if coalesce((v_trust#>>'{governance,platform_health,open_incidents}')::integer,0)>0 then
    v_attention := v_attention||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','CRITICAL','code','OPEN_GOVERNANCE_INCIDENTS','title','Offene Governance-Incidents',
      'detail',(v_trust#>>'{governance,platform_health,open_incidents}')||' Incidents benötigen Aufmerksamkeit.'
    ));
  end if;
  v_attention := v_attention||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'severity','INFO','code','ERROR_TELEMETRY_GAP','title','Decision-Fehlerrate noch nicht kanonisch messbar',
    'detail','Erfolge und Nullergebnisse sind exakt messbar. Fehler werden bis zu einem minimierten Error-Ledger bewusst nicht geschätzt.'
  ));

  return pg_catalog.jsonb_build_object(
    'contractVersion','backyrd.founder-live-product-overview@2.0',
    'generatedAt',v_now,
    'freshForSeconds',90,
    'product',v_product,
    'activity',v_activity,
    'world',v_world,
    'users',v_users,
    'trust',v_trust,
    'attention',v_attention,
    'privacy',pg_catalog.jsonb_build_object(
      'aggregateOnly',true,'rawDecisionTextIncluded',false,'userIdentityIncluded',false,
      'serviceCredentialsIncluded',false,'adminAuthorityRequired',true
    ),
    'history',pg_catalog.jsonb_build_object(
      'launchReadinessArchived',true,'path','/founder/launch-readiness',
      'explanation','Der historische Basel-Launch-Score bleibt als Archiv erhalten und steuert den aktuellen Product-Betrieb nicht.'
    )
  );
end;
$$;

revoke all on function public.founder_live_product_overview_v2()
  from public,anon,authenticated,service_role;
grant execute on function public.founder_live_product_overview_v2()
  to authenticated,service_role;

comment on function public.founder_live_product_overview_v2() is
  'Admin-only, aggregate, read-only Product v1 cockpit over live control, sealed Decision results, World coverage, consent-bound learning and Trust operations. Missing error telemetry is explicit and never inferred.';
