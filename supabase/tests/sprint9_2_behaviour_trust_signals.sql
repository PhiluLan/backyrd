\set ON_ERROR_STOP on

begin;

alter table public.reviews disable trigger user;

create function pg_temp.behaviour_uuid(p_label text) returns uuid
language sql immutable
as $$
  select (
    substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12)
  )::uuid;
$$;

create function pg_temp.behaviour_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9.2 Behaviour Trust acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.behaviour_make_user(p_label text, p_created_at timestamptz)
returns uuid language plpgsql as $$
declare v_id uuid := pg_temp.behaviour_uuid('behaviour-user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@sprint92.invalid','',null,
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
    p_created_at,p_created_at,'','','',''
  );
  insert into public.user_consents(
    user_id,purpose_key,status,granted_at,source,updated_at
  ) values (
    v_id,'optional_product_analytics','granted',p_created_at,
    'system_migration',p_created_at
  );
  return v_id;
end;
$$;

create function pg_temp.behaviour_set_actor(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

insert into public.consent_purposes(
  key,title_de,description_de,category,legal_basis,
  requires_consent,is_required,default_enabled,sort_order,is_active
) values (
  'optional_product_analytics','Optionale Produktanalyse',
  'Synthetische Sprint-9.2-Fixture für eingewilligte Produktnutzung.',
  'analytics','consent',true,false,false,100,true
) on conflict (key) do nothing;

insert into public.spots(id,name,lat,lng)
select pg_temp.behaviour_uuid('behaviour-spot:'||g), 'Behaviour Spot '||g, 47+g/1000.0, 8+g/1000.0
from generate_series(1,12) g;

do $$
begin
  perform pg_temp.behaviour_assert(
    (select count(*)=10 from public.account_trust_signal_registry
     where dimension='behaviour' and signal_key like 'behaviour_%'),
    'all ten Behaviour signals are registered'
  );
  perform pg_temp.behaviour_assert(
    (select count(*)=10 from public.account_trust_behaviour_detector_config
     where enabled and detector_version='1.0.0'),
    'all ten versioned detector configurations are enabled'
  );
end;
$$;

-- Positive detector thresholds: below threshold, exactly at threshold, above,
-- repeat execution, and unrelated controls.
do $$
declare
  v_now timestamptz := now();
  v_search_below uuid := pg_temp.behaviour_make_user('search-below',v_now-interval '20 days');
  v_search_exact uuid := pg_temp.behaviour_make_user('search-exact',v_now-interval '20 days');
  v_decision_below uuid := pg_temp.behaviour_make_user('decision-below',v_now-interval '20 days');
  v_decision_exact uuid := pg_temp.behaviour_make_user('decision-exact',v_now-interval '20 days');
  v_spot_below uuid := pg_temp.behaviour_make_user('spot-below',v_now-interval '20 days');
  v_spot_exact uuid := pg_temp.behaviour_make_user('spot-exact',v_now-interval '20 days');
  v_return_below uuid := pg_temp.behaviour_make_user('return-below',v_now-interval '20 days');
  v_return_exact uuid := pg_temp.behaviour_make_user('return-exact',v_now-interval '20 days');
  v_diversity_below uuid := pg_temp.behaviour_make_user('diversity-below',v_now-interval '20 days');
  v_diversity_exact uuid := pg_temp.behaviour_make_user('diversity-exact',v_now-interval '20 days');
  v_count integer;
begin
  insert into public.user_searches(user_id,query,created_at) values
    (v_search_below,'one',v_now-interval '2 days'),
    (v_search_below,'two',v_now-interval '1 day'),
    (v_search_exact,'one',v_now-interval '2 days'),
    (v_search_exact,'two',v_now-interval '2 days 1 hour'),
    (v_search_exact,'three',v_now-interval '1 day');
  perform public.account_trust_evaluate_behaviour_user_v1(v_search_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_search_exact,v_now);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_search_below and signal_key='behaviour_search_usage')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_search_exact and signal_key='behaviour_search_usage'),
    'search usage is absent below three and present exactly at three across two days'
  );
  insert into public.user_searches(user_id,query,created_at)
  values(v_search_exact,'four',v_now-interval '1 hour');
  perform public.account_trust_evaluate_behaviour_user_v1(v_search_exact,v_now);
  perform pg_temp.behaviour_assert(
    (select count(*)=1 from public.account_trust_signals where user_id=v_search_exact and signal_key='behaviour_search_usage'),
    'search above-threshold and repeated evaluation stay idempotent'
  );

  insert into public.decision_sessions(user_id,city,created_at) values
    (v_decision_below,'Zürich',v_now-interval '2 days'),
    (v_decision_below,'Zürich',v_now-interval '1 day'),
    (v_decision_exact,'Zürich',v_now-interval '2 days'),
    (v_decision_exact,'Zürich',v_now-interval '2 days 1 hour'),
    (v_decision_exact,'Zürich',v_now-interval '1 day');
  perform public.account_trust_evaluate_behaviour_user_v1(v_decision_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_decision_exact,v_now);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_decision_below and signal_key='behaviour_decision_usage')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_decision_exact and signal_key='behaviour_decision_usage'),
    'Decision usage is absent below three and present exactly at three across two days'
  );

  insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
  select v_spot_below,'spot_detail_opened',pg_temp.behaviour_uuid('behaviour-spot:'||g),
         v_now-case when g<=2 then interval '2 days' else interval '1 day' end
  from generate_series(1,4) g;
  insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
  select v_spot_exact,'spot_detail_opened',pg_temp.behaviour_uuid('behaviour-spot:'||g),
         v_now-case when g<=3 then interval '2 days' else interval '1 day' end
  from generate_series(1,5) g;
  perform public.account_trust_evaluate_behaviour_user_v1(v_spot_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_spot_exact,v_now);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_spot_below and signal_key='behaviour_spot_exploration'),
    'Spot exploration remains absent below five distinct Spots'
  );
  perform pg_temp.behaviour_assert(
    (select count(distinct spot_id)=5
       and count(distinct occurred_at::date)=2
     from public.account_trust_behaviour_action_inventory_v1(
       v_spot_exact,v_now-interval '30 days',v_now
     )
     where action_type='spot_open'),
    'Spot exploration fixture contains five distinct Spots over two days'
  );
  perform pg_temp.behaviour_assert(
    (select count(*)=1 from public.account_trust_signals where user_id=v_spot_exact and signal_key='behaviour_spot_exploration'),
    'Spot exploration starts exactly at five distinct Spots over two days'
  );

  insert into public.analytics_sessions(user_id,started_at,last_seen_at) values
    (v_return_below,v_now-interval '10 days',v_now-interval '10 days'),
    (v_return_below,v_now,v_now),
    (v_return_exact,v_now-interval '10 days',v_now-interval '10 days'),
    (v_return_exact,v_now-interval '3 days',v_now-interval '3 days'),
    (v_return_exact,v_now,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_return_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_return_exact,v_now);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_return_below and signal_key='behaviour_returning_user')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_return_exact and signal_key='behaviour_returning_user'),
    'return behaviour requires three session days spanning at least seven days'
  );

  insert into public.user_searches(user_id,query,created_at) values
    (v_diversity_below,'one',v_now-interval '2 days'),
    (v_diversity_below,'two',v_now-interval '1 day'),
    (v_diversity_exact,'one',v_now-interval '2 days'),
    (v_diversity_exact,'two',v_now-interval '1 day');
  insert into public.decision_sessions(user_id,city,created_at) values
    (v_diversity_below,'Basel',v_now-interval '2 days'),
    (v_diversity_below,'Basel',v_now-interval '1 day'),
    (v_diversity_exact,'Basel',v_now-interval '2 days'),
    (v_diversity_exact,'Basel',v_now-interval '1 day');
  insert into public.analytics_events(user_id,event_name,spot_id,occurred_at) values
    (v_diversity_below,'spot_detail_opened',pg_temp.behaviour_uuid('behaviour-spot:1'),v_now-interval '1 day'),
    (v_diversity_below,'spot_detail_opened',pg_temp.behaviour_uuid('behaviour-spot:2'),v_now-interval '1 hour'),
    (v_diversity_exact,'spot_detail_opened',pg_temp.behaviour_uuid('behaviour-spot:1'),v_now-interval '1 day');
  insert into public.favorites(user_id,spot_id,created_at)
  values(v_diversity_exact,pg_temp.behaviour_uuid('behaviour-spot:2'),v_now-interval '1 hour');
  perform public.account_trust_evaluate_behaviour_user_v1(v_diversity_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_diversity_exact,v_now);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_diversity_below and signal_key='behaviour_feature_diversity')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_diversity_exact and signal_key='behaviour_feature_diversity'),
    'feature diversity requires six actions across exactly four feature types'
  );

  select count(*) into v_count from public.account_trust_signals
  where user_id in(v_search_exact,v_decision_exact,v_spot_exact,v_return_exact,v_diversity_exact);
  perform public.account_trust_evaluate_behaviour_user_v1(v_search_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_decision_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_spot_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_return_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_diversity_exact,v_now);
  perform pg_temp.behaviour_assert(
    (select count(*) from public.account_trust_signals
      where user_id in(v_search_exact,v_decision_exact,v_spot_exact,v_return_exact,v_diversity_exact))=v_count,
    'positive detectors are idempotent on repeated execution'
  );
end;
$$;

-- Natural review context accepts Decision links without requiring every
-- possible interaction source.
do $$
declare
  v_now timestamptz := now();
  v_below uuid := pg_temp.behaviour_make_user('natural-below',v_now-interval '40 days');
  v_exact uuid := pg_temp.behaviour_make_user('natural-exact',v_now-interval '40 days');
  v_spot uuid := pg_temp.behaviour_uuid('behaviour-spot:1');
  v_review uuid;
  v_decision uuid;
  v_count integer;
  i integer;
begin
  for i in 1..1 loop
    insert into public.decision_sessions(user_id,city,created_at)
    values(v_below,'Bern',v_now-interval '3 days') returning id into v_decision;
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_below,v_spot,'Natural below',v_now-interval '2 days') returning id into v_review;
    insert into public.backyrd_decision_review_links_v1(user_id,decision_id,review_id,spot_id,decision_created_at,review_created_at)
    values(v_below,v_decision,v_review,v_spot,v_now-interval '3 days',v_now-interval '2 days');
  end loop;
  for i in 1..2 loop
    insert into public.decision_sessions(user_id,city,created_at)
    values(v_exact,'Bern',v_now-make_interval(days=>i+2)) returning id into v_decision;
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_exact,v_spot,'Natural exact '||i,v_now-make_interval(days=>i)) returning id into v_review;
    insert into public.backyrd_decision_review_links_v1(user_id,decision_id,review_id,spot_id,decision_created_at,review_created_at)
    values(v_exact,v_decision,v_review,v_spot,v_now-make_interval(days=>i+2),v_now-make_interval(days=>i));
  end loop;
  perform public.account_trust_evaluate_behaviour_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_exact,v_now);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_below and signal_key='behaviour_natural_reviews')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_exact and signal_key='behaviour_natural_reviews'),
    'natural review support begins exactly at two context-linked reviews'
  );
  select count(*) into v_count from public.account_trust_signals where user_id=v_exact;
  perform public.account_trust_evaluate_behaviour_user_v1(v_exact,v_now);
  perform pg_temp.behaviour_assert(
    (select count(*) from public.account_trust_signals where user_id=v_exact)=v_count,
    'natural-review detection is idempotent'
  );
end;
$$;

-- Conservative risk thresholds and expiration.
do $$
declare
  v_now timestamptz := now();
  v_review_below uuid := pg_temp.behaviour_make_user('review-only-below',v_now-interval '20 days');
  v_review_exact uuid := pg_temp.behaviour_make_user('review-only-exact',v_now-interval '20 days');
  v_review_no_consent uuid := pg_temp.behaviour_make_user('review-only-no-consent',v_now-interval '20 days');
  v_single_below uuid := pg_temp.behaviour_make_user('single-below',v_now-interval '20 days');
  v_single_exact uuid := pg_temp.behaviour_make_user('single-exact',v_now-interval '20 days');
  v_dormant_below uuid := pg_temp.behaviour_make_user('dormant-below',v_now-interval '6 days 23 hours');
  v_dormant_exact uuid := pg_temp.behaviour_make_user('dormant-exact',v_now-interval '8 days');
  v_dormant_return uuid := pg_temp.behaviour_make_user('dormant-return',v_now-interval '8 days');
  v_spot uuid := pg_temp.behaviour_uuid('behaviour-spot:2');
  v_count integer;
  i integer;
begin
  delete from public.user_consents
  where user_id=v_review_no_consent
    and purpose_key='optional_product_analytics';
  for i in 1..4 loop
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_review_below,v_spot,'Below review '||i,v_now-make_interval(days=>(i%3)+1));
  end loop;
  for i in 1..5 loop
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_review_exact,v_spot,'Exact review '||i,v_now-make_interval(days=>(i%3)+1));
  end loop;
  for i in 1..6 loop
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_review_no_consent,v_spot,'No-consent review '||i,v_now-make_interval(days=>(i%3)+1));
  end loop;
  for i in 1..11 loop
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_single_below,v_spot,'Single below '||i,v_now-make_interval(days=>(i%5)+1));
  end loop;
  for i in 1..12 loop
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_single_exact,v_spot,'Single exact '||i,v_now-make_interval(days=>(i%5)+1));
  end loop;
  insert into public.reviews(user_id,spot_id,text,created_at) values
    (v_dormant_below,v_spot,'New user review',v_now-interval '6 days 22 hours'),
    (v_dormant_exact,v_spot,'Dormant review',v_now-interval '7 days 23 hours'),
    (v_dormant_return,v_spot,'Returning review',v_now-interval '7 days 23 hours');
  insert into public.user_searches(user_id,query,created_at)
  values(v_dormant_return,'returned',v_now-interval '2 days');

  perform public.account_trust_evaluate_behaviour_user_v1(v_review_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_review_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_review_no_consent,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_single_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_single_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_dormant_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_dormant_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_dormant_return,v_now);

  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_review_below and signal_key='behaviour_review_only')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_review_exact and signal_key='behaviour_review_only'),
    'review-only risk begins exactly at five reviews over three days for a mature account'
  );
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals
      where user_id=v_review_no_consent and signal_key in(
        'behaviour_review_only','behaviour_single_purpose','behaviour_dormant_pattern'
      )),
    'missing optional-analytics consent is never interpreted as suspicious absence'
  );
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_single_below and signal_key='behaviour_single_purpose')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_single_exact and signal_key='behaviour_single_purpose'),
    'single-purpose risk begins exactly at twelve eligible actions'
  );
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_dormant_below and signal_key='behaviour_dormant_pattern')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_dormant_exact and signal_key='behaviour_dormant_pattern')
    and not exists(select 1 from public.account_trust_signals where user_id=v_dormant_return and signal_key='behaviour_dormant_pattern'),
    'dormant risk waits seven days and is prevented by any later product return'
  );
  perform pg_temp.behaviour_assert(
    (select bool_and(risk_level='normal') from public.account_trust_scores
     where user_id in(v_review_exact,v_single_exact,v_dormant_exact)),
    'no Behaviour risk detector alone classifies an account as suspicious'
  );
  select count(*) into v_count from public.account_trust_signals
  where user_id in(v_review_exact,v_single_exact,v_dormant_exact);
  perform public.account_trust_evaluate_behaviour_user_v1(v_review_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_single_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_dormant_exact,v_now);
  perform pg_temp.behaviour_assert(
    (select count(*) from public.account_trust_signals
      where user_id in(v_review_exact,v_single_exact,v_dormant_exact))=v_count,
    'absence-based risk detectors are idempotent on repeated execution'
  );
end;
$$;

-- Extreme velocity: reviews are excluded, a single busy feature is safe, and
-- the boundary requires 50 actions across at least three types in ten minutes.
do $$
declare
  v_now timestamptz := now();
  v_bucket timestamptz := date_bin(interval '10 minutes',v_now-interval '1 hour',timestamptz '2000-01-01');
  v_below uuid := pg_temp.behaviour_make_user('velocity-below',v_now-interval '20 days');
  v_exact uuid := pg_temp.behaviour_make_user('velocity-exact',v_now-interval '20 days');
  v_above uuid := pg_temp.behaviour_make_user('velocity-above',v_now-interval '20 days');
  v_expired uuid := pg_temp.behaviour_make_user('velocity-expired',v_now-interval '30 days');
  v_expired_eval timestamptz := v_now-interval '8 days';
  v_spot uuid := pg_temp.behaviour_uuid('behaviour-spot:3');
  i integer;
begin
  for i in 1..49 loop
    insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
    values(v_below,case when i<=20 then 'spot_detail_opened' when i<=35 then 'spot_route_clicked' else 'map_spot_opened' end,v_spot,v_bucket+interval '1 minute');
  end loop;
  for i in 1..50 loop
    insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
    values(v_exact,case when i<=20 then 'spot_detail_opened' when i<=35 then 'spot_route_clicked' else 'map_spot_opened' end,v_spot,v_bucket+interval '1 minute');
  end loop;
  for i in 1..51 loop
    insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
    values(v_above,case when i<=20 then 'spot_detail_opened' when i<=35 then 'spot_route_clicked' else 'map_spot_opened' end,v_spot,v_bucket+interval '1 minute');
  end loop;
  for i in 1..50 loop
    insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
    values(v_expired,case when i<=20 then 'spot_detail_opened' when i<=35 then 'spot_route_clicked' else 'map_spot_opened' end,v_spot,
      date_bin(interval '10 minutes',v_expired_eval-interval '1 hour',timestamptz '2000-01-01')+interval '1 minute');
  end loop;
  perform public.account_trust_evaluate_behaviour_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_exact,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_above,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_expired,v_expired_eval);
  perform pg_temp.behaviour_assert(
    not exists(select 1 from public.account_trust_signals where user_id=v_below and signal_key='behaviour_action_velocity')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_exact and signal_key='behaviour_action_velocity')
    and (select count(*)=1 from public.account_trust_signals where user_id=v_above and signal_key='behaviour_action_velocity'),
    'velocity is absent at 49, present exactly at 50, and stable above threshold'
  );
  perform public.account_trust_evaluate_behaviour_user_v1(v_exact,v_now);
  perform pg_temp.behaviour_assert(
    (select count(*)=1 from public.account_trust_signals where user_id=v_exact and signal_key='behaviour_action_velocity'),
    'velocity episode evaluation is idempotent'
  );
  perform pg_temp.behaviour_assert(exists(
    select 1 from public.account_trust_signals
    where user_id=v_expired and signal_key='behaviour_action_velocity'
      and expires_at<=v_now
  ) and (select risk_level='normal' from public.account_trust_scores where user_id=v_expired),
    'expired risk evidence remains audited but no longer affects the aggregate'
  );
end;
$$;

-- False-positive matrix: intense legitimate single-feature sessions and
-- realistic personas never receive a Behaviour risk signal.
do $$
declare
  v_now timestamptz := now();
  v_busy_decisions uuid := pg_temp.behaviour_make_user('busy-decisions',v_now-interval '20 days');
  v_busy_spots uuid := pg_temp.behaviour_make_user('busy-spots',v_now-interval '20 days');
  v_reviewer uuid := pg_temp.behaviour_make_user('healthy-reviewer',v_now-interval '40 days');
  v_tourist uuid := pg_temp.behaviour_make_user('tourist',v_now-interval '20 days');
  v_local uuid := pg_temp.behaviour_make_user('local',v_now-interval '100 days');
  v_spot uuid := pg_temp.behaviour_uuid('behaviour-spot:4');
  i integer;
begin
  for i in 1..60 loop
    insert into public.decision_sessions(user_id,city,created_at)
    values(v_busy_decisions,'Genève',v_now-interval '1 hour'+make_interval(secs=>i));
    insert into public.analytics_events(user_id,event_name,spot_id,occurred_at)
    values(v_busy_spots,'spot_detail_opened',v_spot,v_now-interval '1 hour'+make_interval(secs=>i));
  end loop;
  for i in 1..8 loop
    insert into public.reviews(user_id,spot_id,text,created_at)
    values(v_reviewer,v_spot,'Restaurant week '||i,v_now-make_interval(days=>(i%6)+1));
  end loop;
  insert into public.user_searches(user_id,query,created_at) values
    (v_reviewer,'restaurant',v_now-interval '6 days'),
    (v_reviewer,'dinner',v_now-interval '3 days'),
    (v_reviewer,'local',v_now-interval '1 day'),
    (v_tourist,'vacation',v_now-interval '5 days'),
    (v_local,'coffee',v_now-interval '10 days');
  insert into public.decision_sessions(user_id,city,created_at) values
    (v_reviewer,'Luzern',v_now-interval '5 days'),
    (v_tourist,'Lugano',v_now-interval '5 days'),
    (v_tourist,'Lugano',v_now-interval '4 days'),
    (v_local,'Zürich',v_now-interval '20 days'),
    (v_local,'Zürich',v_now-interval '2 days');
  insert into public.analytics_sessions(user_id,started_at,last_seen_at) values
    (v_tourist,v_now-interval '6 days',v_now-interval '6 days'),
    (v_tourist,v_now-interval '4 days',v_now-interval '4 days'),
    (v_tourist,v_now-interval '2 days',v_now-interval '2 days'),
    (v_local,v_now-interval '50 days',v_now-interval '50 days'),
    (v_local,v_now-interval '20 days',v_now-interval '20 days'),
    (v_local,v_now-interval '2 days',v_now-interval '2 days');
  for i in 1..30 loop
    insert into public.analytics_events(user_id,event_name,spot_id,occurred_at) values
      (v_tourist,'spot_detail_opened',v_spot,v_now-interval '3 hours'+make_interval(secs=>i)),
      (v_local,'spot_detail_opened',v_spot,v_now-make_interval(days=>(i%20)+1));
  end loop;

  perform public.account_trust_evaluate_behaviour_user_v1(v_busy_decisions,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_busy_spots,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_reviewer,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_tourist,v_now);
  perform public.account_trust_evaluate_behaviour_user_v1(v_local,v_now);
  perform pg_temp.behaviour_assert(not exists(
    select 1 from public.account_trust_signals
    where user_id in(v_busy_decisions,v_busy_spots,v_reviewer,v_tourist,v_local)
      and polarity='risk' and dimension='behaviour'
  ), 'new users, power users, reviewers, explorers, tourists, locals, restaurant-heavy weeks, vacation usage, busy Decision evenings, and busy Spot evenings remain non-suspicious');
end;
$$;

-- Admin visibility, least privilege, scheduler, and no enforcement.
do $$
declare
  v_now timestamptz := now();
  v_admin uuid := pg_temp.behaviour_make_user('behaviour-admin',v_now);
  v_normal uuid := pg_temp.behaviour_make_user('behaviour-normal',v_now);
  v_target uuid := pg_temp.behaviour_uuid('behaviour-user:search-exact');
  v_detail jsonb;
  v_enforcements integer;
  v_measures integer;
  v_events integer;
begin
  select count(*) into v_enforcements from public.safety_account_enforcements;
  select count(*) into v_measures from public.safety_account_measures;
  select count(*) into v_events from public.safety_user_enforcement_events;
  update public.profiles set is_admin=true where id=v_admin;
  perform pg_temp.behaviour_set_actor(v_admin);
  v_detail := public.account_trust_admin_detail_v1(v_target);
  perform pg_temp.behaviour_assert(
    (v_detail->'score'->'dimension_scores'->>'behaviour') is not null
    and exists(select 1 from jsonb_array_elements(v_detail->'signals') s
      where s->>'signal_key'='behaviour_search_usage'
        and s->>'detector_version'='1.0.0'
        and (s->'evidence'->>'action_count')::integer>=3),
    'existing Admin contract exposes Behaviour score, evidence, and detector version'
  );
  perform pg_temp.behaviour_set_actor(v_normal);
  perform pg_temp.behaviour_assert(
    not has_function_privilege('authenticated','public.account_trust_behaviour_action_inventory_v1(uuid,timestamp with time zone,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_evaluate_behaviour_user_v1(uuid,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_evaluate_behaviour_due_v1(integer,timestamp with time zone)','EXECUTE'),
    'normal users cannot fabricate or evaluate Behaviour Trust signals'
  );
  perform pg_temp.behaviour_assert(
    (select count(*) from public.safety_account_enforcements)=v_enforcements
    and (select count(*) from public.safety_account_measures)=v_measures
    and (select count(*) from public.safety_user_enforcement_events)=v_events,
    'Behaviour Trust creates no punishment or enforcement'
  );
end;
$$;

do $$
begin
  perform pg_temp.behaviour_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'account_trust_%'
      and p.prosecdef and (p.proconfig is null or not exists(
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  ), 'all Account Trust SECURITY DEFINER functions have explicit search_path');
  perform pg_temp.behaviour_assert(not exists(
    select 1 from (values('account_trust_behaviour_detector_config'),('account_trust_behaviour_evaluation_state')) t(table_name)
    join pg_class c on c.relname=t.table_name
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where not c.relrowsecurity
  ), 'RLS is enabled for Behaviour configuration and scheduling state');
  perform pg_temp.behaviour_assert(not exists(
    select 1 from (values('account_trust_behaviour_detector_config'),('account_trust_behaviour_evaluation_state')) t(table_name)
    where has_table_privilege('anon','public.'||t.table_name,'SELECT')
       or has_table_privilege('authenticated','public.'||t.table_name,'SELECT,INSERT,UPDATE,DELETE')
  ), 'client roles cannot read or mutate Behaviour detector state');
  perform pg_temp.behaviour_assert(exists(
    select 1 from cron.job where jobname='backyrd-account-trust-behaviour-daily'
      and active and schedule='43 3 * * *'
      and command like '%account_trust_evaluate_behaviour_due_v1(1000, now())%'
  ), 'one secret-free daily Behaviour evaluation job exists');
  perform pg_temp.behaviour_assert(not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name like 'account_trust_behaviour%'
      and column_name in('mouse_x','mouse_y','scroll_pixels','touch_data','keystroke_timing','fingerprint','session_replay')
  ), 'Behaviour Trust introduces no invasive telemetry fields');
end;
$$;

alter table public.reviews enable trigger user;
rollback;

\echo 'Sprint 9.2 Behaviour Trust Signals acceptance passed.'
