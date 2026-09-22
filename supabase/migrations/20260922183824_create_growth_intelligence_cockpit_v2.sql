-- Product-v1 Growth Intelligence.
--
-- Decision success and candidate-open milestones are copied into the existing
-- consent-governed analytics ledger. The source Product ledgers stay immutable;
-- no raw request text, ranking payload, identity token or private World data is
-- copied. Users without optional analytics consent remain absent by design.

create or replace function decision_vnext_private.capture_product_growth_success_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_envelope jsonb;
  v_decision_id uuid;
begin
  if new.purpose <> 'PRODUCT_DECISION_VNEXT_EVALUATION'
     or new.response_contract_version <> 'backyrd.decision-vnext.product-response@1.0' then
    return new;
  end if;

  begin
    v_envelope := new.response_envelope_bytes::jsonb;
    if v_envelope#>>'{response,status}' <> 'AVAILABLE' then return new; end if;
    v_decision_id := (v_envelope#>>'{response,decisionId}')::uuid;
  exception when others then
    return new;
  end;

  if not exists (
    select 1 from public.analytics_events e
    where e.user_id = new.auth_user_id
      and e.event_name = 'decision_vnext_completed'
      and e.decision_id = v_decision_id
  ) then
    insert into public.analytics_events(
      user_id,event_name,screen_name,entity_type,entity_id,decision_id,
      properties,occurred_at
    ) values (
      new.auth_user_id,'decision_vnext_completed','wohin','decision',v_decision_id,v_decision_id,
      pg_catalog.jsonb_build_object(
        'source','sealed_product_ledger',
        'contract_version',new.response_contract_version,
        'generation',new.generation,
        'candidate_count',pg_catalog.jsonb_array_length(coalesce(v_envelope#>'{response,candidates}','[]'::jsonb))
      ),new.created_at
    );
  end if;
  return new;
end;
$$;

revoke all on function decision_vnext_private.capture_product_growth_success_v1()
  from public,anon,authenticated,service_role;

create trigger decision_vnext_product_growth_success_v1
after insert on decision_vnext_private.product_idempotency_records_v1
for each row execute function decision_vnext_private.capture_product_growth_success_v1();

create or replace function decision_vnext_private.capture_product_growth_open_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision_id uuid;
  v_spot_id uuid;
begin
  if new.event_type <> 'candidate_opened' then return new; end if;
  begin
    v_decision_id := (new.record->>'decisionId')::uuid;
    v_spot_id := (new.record->>'spotId')::uuid;
  exception when others then
    return new;
  end;

  if not exists (
    select 1 from public.analytics_events e
    where e.user_id = new.user_id
      and e.event_name = 'decision_vnext_candidate_opened'
      and e.decision_id = v_decision_id
      and e.spot_id = v_spot_id
  ) then
    insert into public.analytics_events(
      user_id,event_name,screen_name,entity_type,entity_id,spot_id,decision_id,
      properties,occurred_at
    ) values (
      new.user_id,'decision_vnext_candidate_opened','wohin','spot',v_spot_id,v_spot_id,v_decision_id,
      pg_catalog.jsonb_build_object('source','consent_bound_product_interaction'),new.occurred_at
    );
  end if;
  return new;
end;
$$;

revoke all on function decision_vnext_private.capture_product_growth_open_v1()
  from public,anon,authenticated,service_role;

create trigger decision_vnext_product_growth_open_v1
after insert on decision_vnext_private.product_learning_records_v1
for each row execute function decision_vnext_private.capture_product_growth_open_v1();

-- Recover only still-present canonical Product records. The inserts remain
-- consent-gated by trg_analytics_events_consent and are intentionally not a
-- claim of complete historical telemetry.
with source as materialized (
  select r.*,
    case
      when pg_catalog.pg_input_is_valid(r.response_envelope_bytes::jsonb#>>'{response,decisionId}','uuid')
      then (r.response_envelope_bytes::jsonb#>>'{response,decisionId}')::uuid
      else null
    end as decision_uuid
  from decision_vnext_private.product_idempotency_records_v1 r
  where r.purpose='PRODUCT_DECISION_VNEXT_EVALUATION'
    and r.response_contract_version='backyrd.decision-vnext.product-response@1.0'
    and r.response_envelope_bytes::jsonb#>>'{response,status}'='AVAILABLE'
)
insert into public.analytics_events(
  user_id,event_name,screen_name,entity_type,entity_id,decision_id,properties,occurred_at
)
select r.auth_user_id,'decision_vnext_completed','wohin','decision',
  r.decision_uuid,r.decision_uuid,
  pg_catalog.jsonb_build_object(
    'source','sealed_product_ledger_backfill',
    'contract_version',r.response_contract_version,
    'generation',r.generation,
    'candidate_count',pg_catalog.jsonb_array_length(coalesce(r.response_envelope_bytes::jsonb#>'{response,candidates}','[]'::jsonb))
  ),r.created_at
from source r
where r.decision_uuid is not null
  and not exists (
    select 1 from public.analytics_events e
    where e.user_id=r.auth_user_id and e.event_name='decision_vnext_completed'
      and e.decision_id=r.decision_uuid
  );

with source as materialized (
  select l.*,
    case when pg_catalog.pg_input_is_valid(l.record->>'decisionId','uuid')
      then (l.record->>'decisionId')::uuid else null end as decision_uuid,
    case when pg_catalog.pg_input_is_valid(l.record->>'spotId','uuid')
      then (l.record->>'spotId')::uuid else null end as spot_uuid
  from decision_vnext_private.product_learning_records_v1 l
  where l.event_type='candidate_opened'
)
insert into public.analytics_events(
  user_id,event_name,screen_name,entity_type,entity_id,spot_id,decision_id,properties,occurred_at
)
select l.user_id,'decision_vnext_candidate_opened','wohin','spot',
  l.spot_uuid,l.spot_uuid,l.decision_uuid,
  pg_catalog.jsonb_build_object('source','consent_bound_product_interaction_backfill'),l.occurred_at
from source l
where l.decision_uuid is not null and l.spot_uuid is not null
  and not exists (
    select 1 from public.analytics_events e
    where e.user_id=l.user_id and e.event_name='decision_vnext_candidate_opened'
      and e.decision_id=l.decision_uuid and e.spot_id=l.spot_uuid
  );

create index if not exists analytics_events_growth_v2_idx
  on public.analytics_events(event_name,occurred_at,user_id)
  where event_name in (
    'app_opened','app_foregrounded','screen_view','spot_detail_opened',
    'decision_vnext_completed','decision_vnext_candidate_opened','review_submitted'
  );

create or replace function public.admin_growth_intelligence_v2(
  p_from timestamptz,p_to timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_live jsonb;
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_from>=p_to or p_to>v_now+interval '5 minutes'
     or p_to-p_from>interval '370 days' then
    raise exception 'invalid_date_range' using errcode='22023';
  end if;

  v_live := public.founder_live_product_overview_v2();

  with
  measured_events as materialized (
    select e.user_id,e.event_name,e.occurred_at,e.properties,e.decision_id,e.spot_id
    from public.analytics_events e
    where e.user_id is not null and e.occurred_at<p_to
      and e.event_name in (
        'app_opened','app_foregrounded','screen_view','spot_opened','spot_detail_opened',
        'map_spot_opened','feed_spot_opened','profile_spot_opened','nearby_spot_opened',
        'decision_vnext_completed','decision_vnext_candidate_opened','review_submitted'
      )
  ),
  consented as materialized (
    select c.user_id
    from public.user_consents c
    where c.purpose_key='optional_product_analytics' and c.status='granted'
  ),
  user_facts as materialized (
    select u.id user_id,u.created_at registered_at,(c.user_id is not null) analytics_enabled,
      min(e.occurred_at) filter(where e.event_name='decision_vnext_completed') first_decision_at,
      min(e.occurred_at) filter(where e.event_name='decision_vnext_candidate_opened') first_open_at,
      min(e.occurred_at) filter(where e.event_name in (
        'spot_opened','spot_detail_opened','map_spot_opened','feed_spot_opened','profile_spot_opened',
        'nearby_spot_opened','decision_vnext_completed','decision_vnext_candidate_opened','review_submitted'
      )) first_value_at
    from auth.users u
    left join consented c on c.user_id=u.id
    left join measured_events e on e.user_id=u.id and e.occurred_at>=u.created_at
    where u.deleted_at is null
    group by u.id,u.created_at,c.user_id
  ),
  cohort as materialized (
    select * from user_facts where registered_at>=p_from and registered_at<p_to
  ),
  active as materialized (
    select distinct e.user_id from measured_events e
    where e.occurred_at>=p_from and e.occurred_at<p_to
      and e.event_name in ('app_opened','app_foregrounded','screen_view','spot_detail_opened','decision_vnext_completed','decision_vnext_candidate_opened','review_submitted')
  ),
  daily_series as (
    select pg_catalog.generate_series(
      pg_catalog.date_trunc('day',p_from),
      pg_catalog.date_trunc('day',p_to-interval '1 millisecond'),interval '1 day'
    )::date metric_date
  ),
  daily as (
    select d.metric_date,
      (select count(*)::integer from auth.users u where u.deleted_at is null and u.created_at>=d.metric_date::timestamptz and u.created_at<(d.metric_date+1)::timestamptz) registrations,
      (select count(distinct e.user_id)::integer from measured_events e where e.occurred_at>=d.metric_date::timestamptz and e.occurred_at<(d.metric_date+1)::timestamptz) measured_active_users,
      (select count(*)::integer from measured_events e where e.event_name='decision_vnext_completed' and e.occurred_at>=d.metric_date::timestamptz and e.occurred_at<(d.metric_date+1)::timestamptz) successful_decisions,
      (select count(*)::integer from measured_events e where e.event_name='decision_vnext_candidate_opened' and e.occurred_at>=d.metric_date::timestamptz and e.occurred_at<(d.metric_date+1)::timestamptz) candidate_opens
    from daily_series d
  ),
  cohorts as (
    select pg_catalog.date_trunc('week',f.registered_at)::date cohort_week,
      count(*)::integer cohort_size,
      count(*) filter(where f.analytics_enabled)::integer measurable_users,
      count(*) filter(where f.first_decision_at<f.registered_at+interval '7 days')::integer activated,
      count(*) filter(where f.registered_at<=v_now-interval '2 days')::integer d1_eligible,
      count(*) filter(where f.registered_at<=v_now-interval '8 days')::integer d7_eligible,
      count(*) filter(where f.registered_at<=v_now-interval '31 days')::integer d30_eligible,
      count(*) filter(where f.registered_at<=v_now-interval '2 days' and exists(
        select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '1 day' and e.occurred_at<f.registered_at+interval '2 days'))::integer d1_retained,
      count(*) filter(where f.registered_at<=v_now-interval '8 days' and exists(
        select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '7 days' and e.occurred_at<f.registered_at+interval '8 days'))::integer d7_retained,
      count(*) filter(where f.registered_at<=v_now-interval '31 days' and exists(
        select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '30 days' and e.occurred_at<f.registered_at+interval '31 days'))::integer d30_retained
    from user_facts f where f.registered_at>=p_from and f.registered_at<p_to
    group by 1 order by 1
  ),
  funnel as (
    select 1 step_order,'Registriert'::text step_name,count(*)::integer users,'ALL_ACCOUNTS'::text coverage from cohort
    union all select 2,'Analytics messbar',count(*)::integer,'OPTIONAL_ANALYTICS_CONSENT' from cohort where analytics_enabled
    union all select 3,'Erste erfolgreiche Decision vNext',count(*)::integer,'OPTIONAL_ANALYTICS_CONSENT' from cohort where analytics_enabled and first_decision_at<registered_at+interval '7 days'
    union all select 4,'Erstes vorgeschlagenes Ziel geöffnet',count(*)::integer,'ANALYTICS_AND_PERSONALIZATION_CONSENT' from cohort where analytics_enabled and first_decision_at is not null and first_open_at is not null
    union all select 5,'Zurückgekehrt an Tag 7',count(*)::integer,'OPTIONAL_ANALYTICS_CONSENT' from cohort f where analytics_enabled and first_decision_at is not null and exists(
      select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '7 days' and e.occurred_at<f.registered_at+interval '8 days')
  ),
  acquisition as (
    select coalesce(nullif(e.properties->>'source',''),nullif(e.properties->>'channel',''),'Direkt / unbekannt') source,
      count(distinct e.user_id)::integer users
    from measured_events e
    where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name in ('app_opened','screen_view')
    group by 1 order by users desc limit 12
  ),
  summary as (
    select
      (select count(*)::integer from cohort) registrations,
      (select count(*)::integer from cohort where analytics_enabled) measurable_registrations,
      (select count(*)::integer from cohort where analytics_enabled and first_decision_at<registered_at+interval '7 days') activated,
      (select count(*)::integer from active) measured_active_users,
      (select count(*)::integer from active a where exists(select 1 from measured_events e where e.user_id=a.user_id and e.occurred_at<p_from)) returning_users,
      (select count(*)::integer from measured_events e where e.event_name='decision_vnext_completed' and e.occurred_at>=p_from and e.occurred_at<p_to) successful_decisions,
      (select count(distinct e.user_id)::integer from measured_events e where e.event_name='decision_vnext_completed' and e.occurred_at>=p_from and e.occurred_at<p_to) decision_users,
      (select count(*)::integer from measured_events e where e.event_name='decision_vnext_candidate_opened' and e.occurred_at>=p_from and e.occurred_at<p_to) candidate_opens,
      (select count(*)::integer from cohort where registered_at<=v_now-interval '2 days') d1_eligible,
      (select count(*)::integer from cohort f where registered_at<=v_now-interval '2 days' and exists(select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '1 day' and e.occurred_at<f.registered_at+interval '2 days')) d1_retained,
      (select count(*)::integer from cohort where registered_at<=v_now-interval '8 days') d7_eligible,
      (select count(*)::integer from cohort f where registered_at<=v_now-interval '8 days' and exists(select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '7 days' and e.occurred_at<f.registered_at+interval '8 days')) d7_retained,
      (select count(*)::integer from cohort where registered_at<=v_now-interval '31 days') d30_eligible,
      (select count(*)::integer from cohort f where registered_at<=v_now-interval '31 days' and exists(select 1 from measured_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '30 days' and e.occurred_at<f.registered_at+interval '31 days')) d30_retained,
      (select pg_catalog.percentile_cont(0.5) within group(order by extract(epoch from(first_decision_at-registered_at))/60.0) from cohort where analytics_enabled and first_decision_at>=registered_at and first_decision_at<registered_at+interval '7 days') median_ttv
  )
  select pg_catalog.jsonb_build_object(
    'contractVersion','backyrd.admin-growth-intelligence@2.0',
    'generatedAt',v_now,'freshForSeconds',75,
    'range',pg_catalog.jsonb_build_object('from',p_from,'to',p_to),
    'product',pg_catalog.jsonb_build_object(
      'effectiveState',v_live#>>'{product,effectiveState}',
      'engine',v_live#>>'{product,engine}',
      'route',v_live#>>'{product,route}',
      'singleRoute',(v_live#>>'{product,singleRoute}')::boolean,
      'legacyFallback',(v_live#>>'{product,legacyFallback}')::boolean,
      'successfulDecisions24h',(v_live#>>'{activity,successfulDecisions24h}')::integer,
      'activeDecisionUsers24h',(v_live#>>'{activity,activeDecisionUsers24h}')::integer,
      'lastSuccessfulDecisionAt',v_live#>>'{activity,lastSuccessfulDecisionAt}',
      'errorTelemetryStatus',v_live#>>'{activity,errorTelemetry,status}'
    ),
    'summary',(select pg_catalog.jsonb_build_object(
      'registrations',registrations,'measurableRegistrations',measurable_registrations,
      'activationRate',case when measurable_registrations=0 then null else pg_catalog.round(100.0*activated/measurable_registrations,1) end,
      'activated',activated,'measuredActiveUsers',measured_active_users,'returningUsers',returning_users,
      'successfulDecisions',successful_decisions,'decisionUsers',decision_users,'candidateOpens',candidate_opens,
      'medianTimeToValueMinutes',case when median_ttv is null then null else pg_catalog.round(median_ttv::numeric,1) end,
      'd1Retention',case when d1_eligible=0 then null else pg_catalog.round(100.0*d1_retained/d1_eligible,1) end,'d1Eligible',d1_eligible,
      'd7Retention',case when d7_eligible=0 then null else pg_catalog.round(100.0*d7_retained/d7_eligible,1) end,'d7Eligible',d7_eligible,
      'd30Retention',case when d30_eligible=0 then null else pg_catalog.round(100.0*d30_retained/d30_eligible,1) end,'d30Eligible',d30_eligible
    ) from summary),
    'coverage',pg_catalog.jsonb_build_object(
      'registeredUsers',(select count(*)::integer from user_facts),
      'analyticsConsentedUsers',(select count(*)::integer from user_facts where analytics_enabled),
      'analyticsConsentPercent',case when (select count(*) from user_facts)=0 then 0 else pg_catalog.round(100.0*(select count(*) from user_facts where analytics_enabled)/(select count(*) from user_facts),1) end,
      'decisionSuccessSource','SEALED_PRODUCT_LEDGER_TO_CONSENTED_ANALYTICS',
      'candidateOpenSource','CONSENT_BOUND_PRODUCT_INTERACTION',
      'historicalCompleteness','FORWARD_COMPLETE_FROM_MIGRATION_PARTIAL_BEFORE'
    ),
    'daily',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.metric_date) from daily d),'[]'::jsonb),
    'funnel',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) order by f.step_order) from funnel f),'[]'::jsonb),
    'cohorts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.cohort_week) from cohorts c),'[]'::jsonb),
    'acquisition',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)) from acquisition a),'[]'::jsonb),
    'definitions',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('key','activation','label','Aktivierung','definition','Erste erfolgreich versiegelte Decision-vNext-Antwort innerhalb von sieben Tagen nach Registrierung. Nur bei optionaler Analytics-Einwilligung messbar.'),
      pg_catalog.jsonb_build_object('key','timeToValue','label','Time to Value','definition','Zeit zwischen Registrierung und erster erfolgreich versiegelter Decision-vNext-Antwort.'),
      pg_catalog.jsonb_build_object('key','retention','label','Retention','definition','Messbare Produktaktivität im exakten Tagesfenster nach Registrierung. Unreife Kohorten werden nicht als null Prozent ausgegeben.')
    ),
    'limitations',pg_catalog.jsonb_build_array(
      'Optionale Produktanalytik bildet nur Nutzer mit gültiger Einwilligung ab.',
      'Decision-vNext-Meilensteine sind ab dieser Migration vollständig; ältere Historie ist nur soweit aus noch vorhandenen versiegelten Ledgers rekonstruierbar.',
      'Fehlgeschlagene Edge-Anfragen besitzen noch kein kanonisches minimiertes Fehler-Ledger und werden nicht geschätzt.'
    ),
    'privacy',pg_catalog.jsonb_build_object(
      'aggregateOnly',true,'rawDecisionTextIncluded',false,'userIdentityIncluded',false,
      'serviceCredentialsIncluded',false,'adminAuthorityRequired',true
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_growth_intelligence_v2(timestamptz,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_growth_intelligence_v2(timestamptz,timestamptz)
  to authenticated,service_role;

comment on function public.admin_growth_intelligence_v2(timestamptz,timestamptz) is
  'Admin-only Product-v1 growth cockpit. Uses sealed Decision success and consent-governed analytics, distinguishes unknown from zero, and excludes raw queries and user identities.';
