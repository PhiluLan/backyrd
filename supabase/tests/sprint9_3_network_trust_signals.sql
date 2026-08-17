\set ON_ERROR_STOP on

begin;

alter table public.reviews disable trigger user;

create function pg_temp.network_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.network_assert(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9.3 Network Trust acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.network_make_user(
  p_label text,p_created_at timestamptz,p_consent boolean default true
) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.network_uuid('network-user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@sprint93.invalid','',p_created_at,
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

create function pg_temp.network_add_review(
  p_user_id uuid,p_spot_id uuid,p_text text,p_created_at timestamptz
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.reviews(user_id,spot_id,text,created_at)
  values(p_user_id,p_spot_id,p_text,p_created_at) returning id into v_id;
  return v_id;
end;
$$;

create function pg_temp.network_add_integrity_signal(
  p_review_id uuid,p_signal_type text,p_categories jsonb
) returns uuid language plpgsql as $$
declare v_review public.reviews%rowtype;v_item uuid;v_case uuid;v_signal uuid;
begin
  select * into v_review from public.reviews where id=p_review_id;
  insert into public.safety_content_items(
    content_type,entity_type,entity_id,spot_id,actor_user_id,text_content,lifecycle_status
  ) values('review','review',v_review.id,v_review.spot_id,v_review.user_id,v_review.text,'live')
  on conflict(content_type,entity_type,entity_id) do update set updated_at=now()
  returning id into v_item;
  insert into public.safety_cases(content_item_id,case_status,priority)
  values(v_item,'needs_review',60) returning id into v_case;
  insert into public.safety_signals(
    case_id,signal_type,provider,model,model_version,categories,scores,flagged,raw_response
  ) values(v_case,p_signal_type,'backyrd_integrity','deterministic_rules','review-integrity-v1',
    p_categories||'{"risk_level":"suspicious"}'::jsonb,'{"integrity_score":0.9}'::jsonb,true,
    jsonb_build_object('review_id',v_review.id,'integrity_version','v1'))
  returning id into v_signal;
  return v_signal;
end;
$$;

create function pg_temp.network_set_actor(p_user_id uuid)
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
  'Synthetische Sprint-9.3-Fixture.','analytics','consent',true,false,false,100,true)
on conflict(key) do nothing;

insert into public.spots(id,name,lat,lng)
select pg_temp.network_uuid('network-spot:'||g),'Network Spot '||g,47+g/1000.0,8+g/1000.0
from generate_series(1,100) g;

create temporary table network_side_effect_baseline as
select
  (select count(*) from public.safety_account_enforcements) enforcements,
  (select count(*) from public.safety_account_measures) measures,
  (select count(*) from public.safety_user_enforcement_events) user_events,
  (select count(*) from public.safety_enforcement_events) enforcement_events,
  (select count(*) from public.ranking_config) ranking_rows;

do $$
begin
  perform pg_temp.network_assert(
    (select count(*)=8 from public.account_trust_signal_registry
      where dimension='network' and signal_key like 'network_%'),
    'all eight Network signals are registered'
  );
  perform pg_temp.network_assert(
    (select count(*)=8 from public.account_trust_network_detector_config
      where enabled and detector_version='1.0.0'),
    'all eight versioned Network detectors are configured'
  );
end;
$$;

-- Shared installation: one account is below, two are exactly at threshold,
-- three are above, and withdrawn/missing consent is unknown rather than risk.
do $$
declare
  v_now timestamptz:=now();
  v_single uuid:=pg_temp.network_make_user('shared-single',v_now-interval '100 days');
  v_at_a uuid:=pg_temp.network_make_user('shared-at-a',v_now-interval '100 days');
  v_at_b uuid:=pg_temp.network_make_user('shared-at-b',v_now-interval '100 days');
  v_above_a uuid:=pg_temp.network_make_user('shared-above-a',v_now-interval '100 days');
  v_above_b uuid:=pg_temp.network_make_user('shared-above-b',v_now-interval '100 days');
  v_above_c uuid:=pg_temp.network_make_user('shared-above-c',v_now-interval '100 days');
  v_unknown_a uuid:=pg_temp.network_make_user('shared-unknown-a',v_now-interval '100 days');
  v_unknown_b uuid:=pg_temp.network_make_user('shared-unknown-b',v_now-interval '100 days',false);
  v_count integer;
begin
  perform public.account_trust_record_technical_identity_v1(v_single,pg_temp.network_uuid('install-single'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_at_a,pg_temp.network_uuid('install-at'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_at_b,pg_temp.network_uuid('install-at'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_above_a,pg_temp.network_uuid('install-above'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_above_b,pg_temp.network_uuid('install-above'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_above_c,pg_temp.network_uuid('install-above'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_unknown_a,pg_temp.network_uuid('install-unknown'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_unknown_b,pg_temp.network_uuid('install-unknown'),v_now);
  perform public.account_trust_evaluate_network_user_v1(v_single,v_now);
  perform public.account_trust_evaluate_network_user_v1(v_at_a,v_now);
  perform public.account_trust_evaluate_network_user_v1(v_above_a,v_now);
  perform public.account_trust_evaluate_network_user_v1(v_unknown_a,v_now);
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_single and signal_key='network_shared_installation'),
    'one installation account remains below threshold');
  perform pg_temp.network_assert((select evidence->>'associated_account_count'='2'
    from public.account_trust_signals where user_id=v_at_a and signal_key='network_shared_installation'),
    'two consented accounts meet the shared-installation threshold');
  perform pg_temp.network_assert((select evidence->>'associated_account_count'='3'
    from public.account_trust_signals where user_id=v_above_a and signal_key='network_shared_installation'),
    'three consented accounts remain stable above threshold');
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_unknown_a and signal_key='network_shared_installation'),
    'missing consent is unknown and cannot create shared-installation evidence');
  perform pg_temp.network_assert((select risk_level='normal' from public.account_trust_scores where user_id=v_at_a),
    'shared installation alone cannot classify an account as suspicious');
  perform pg_temp.network_assert((select evidence->>'technical_identity_hash' ~ '^[0-9a-f]{64}$'
    and not(evidence ? 'installation_id') from public.account_trust_signals
    where user_id=v_at_a and signal_key='network_shared_installation'),
    'shared-installation evidence exposes only the SHA-256 technical identity');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at_a and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at_a,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at_a and dimension='network')=v_count,'shared-installation evaluation is idempotent');
end;
$$;

-- Coordinated review overlap: the same pair must overlap across three Spots.
do $$
declare
  v_now timestamptz:=now();i integer;j integer;v_user uuid;v_peer uuid;v_spot uuid;
  v_below uuid:=pg_temp.network_make_user('overlap-below',v_now-interval '100 days');
  v_below_peer uuid:=pg_temp.network_make_user('overlap-below-peer',v_now-interval '100 days');
  v_at uuid:=pg_temp.network_make_user('overlap-at',v_now-interval '100 days');
  v_at_peer uuid:=pg_temp.network_make_user('overlap-at-peer',v_now-interval '100 days');
  v_above uuid:=pg_temp.network_make_user('overlap-above',v_now-interval '100 days');
  v_above_peer uuid:=pg_temp.network_make_user('overlap-above-peer',v_now-interval '100 days');
  v_popular uuid:=pg_temp.network_make_user('popular-control',v_now-interval '100 days');
  v_expired uuid:=pg_temp.network_make_user('overlap-expired',v_now-interval '200 days');
  v_expired_peer uuid:=pg_temp.network_make_user('overlap-expired-peer',v_now-interval '200 days');
  v_eval timestamptz:=v_now-interval '31 days';v_count integer;
begin
  for j in 1..3 loop
    v_user:=case j when 1 then v_below when 2 then v_at else v_above end;
    v_peer:=case j when 1 then v_below_peer when 2 then v_at_peer else v_above_peer end;
    for i in 1..(j+1) loop
      v_spot:=pg_temp.network_uuid('network-spot:'||(5+j*5+i));
      perform pg_temp.network_add_review(v_user,v_spot,'Independent review '||i,v_now-make_interval(days=>i));
      perform pg_temp.network_add_review(v_peer,v_spot,'Different opinion '||i,v_now-make_interval(days=>i)+interval '5 minutes');
    end loop;
    perform public.account_trust_evaluate_network_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_coordinated_review_overlap'),
    'two shared Spots remain below review-overlap threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_coordinated_review_overlap'
      and (evidence->>'shared_spot_count')::integer=3),'three shared Spots meet review-overlap threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='network_coordinated_review_overlap'
      and (evidence->>'shared_spot_count')::integer=4),'four shared Spots remain above threshold');
  for i in 1..8 loop
    v_peer:=pg_temp.network_make_user('popular-peer-'||i,v_now-interval '100 days');
    perform pg_temp.network_add_review(v_peer,pg_temp.network_uuid('network-spot:30'),'Popular opening '||i,v_now-interval '1 day');
  end loop;
  perform pg_temp.network_add_review(v_popular,pg_temp.network_uuid('network-spot:30'),'Popular opening control',v_now-interval '1 day');
  perform public.account_trust_evaluate_network_user_v1(v_popular,v_now);
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_popular and signal_key='network_coordinated_review_overlap'),
    'one popular Spot with many independent accounts is not a coordinated network');
  for i in 1..3 loop
    v_spot:=pg_temp.network_uuid('network-spot:'||(35+i));
    perform pg_temp.network_add_review(v_expired,v_spot,'Historical A '||i,v_eval-make_interval(days=>i));
    perform pg_temp.network_add_review(v_expired_peer,v_spot,'Historical B '||i,v_eval-make_interval(days=>i)+interval '2 minutes');
  end loop;
  perform public.account_trust_evaluate_network_user_v1(v_expired,v_eval);
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_expired and signal_key='network_coordinated_review_overlap' and expires_at<=v_now)
    and (select (dimension_scores->>'network')::numeric=60 from public.account_trust_scores where user_id=v_expired),
    'expired short-term Network evidence remains audited but no longer contributes');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'review-overlap evaluation is idempotent');
end;
$$;

-- Coordinated content similarity consumes canonical Sprint 8 evidence only.
do $$
declare
  v_now timestamptz:=now();i integer;j integer;v_primary uuid;v_a uuid;v_b uuid;v_anchor uuid;v_spot uuid;
  v_below uuid:=pg_temp.network_make_user('content-below',v_now-interval '100 days');
  v_below_a uuid:=pg_temp.network_make_user('content-below-a',v_now-interval '100 days');
  v_below_b uuid:=pg_temp.network_make_user('content-below-b',v_now-interval '100 days');
  v_at uuid:=pg_temp.network_make_user('content-at',v_now-interval '100 days');
  v_at_a uuid:=pg_temp.network_make_user('content-at-a',v_now-interval '100 days');
  v_at_b uuid:=pg_temp.network_make_user('content-at-b',v_now-interval '100 days');
  v_above uuid:=pg_temp.network_make_user('content-above',v_now-interval '100 days');
  v_above_a uuid:=pg_temp.network_make_user('content-above-a',v_now-interval '100 days');
  v_above_b uuid:=pg_temp.network_make_user('content-above-b',v_now-interval '100 days');
  v_control uuid:=pg_temp.network_make_user('content-control',v_now-interval '100 days');v_count integer;
begin
  for j in 1..3 loop
    v_primary:=case j when 1 then v_below when 2 then v_at else v_above end;
    v_a:=case j when 1 then v_below_a when 2 then v_at_a else v_above_a end;
    v_b:=case j when 1 then v_below_b when 2 then v_at_b else v_above_b end;
    for i in 1..j loop
      v_spot:=pg_temp.network_uuid('network-spot:'||(40+j*4+i));
      perform pg_temp.network_add_review(v_a,v_spot,'Coordinated content fixture',v_now-make_interval(days=>i)-interval '2 minutes');
      perform pg_temp.network_add_review(v_b,v_spot,'Coordinated content fixture',v_now-make_interval(days=>i)-interval '1 minute');
      v_anchor:=pg_temp.network_add_review(v_primary,v_spot,'Coordinated content fixture',v_now-make_interval(days=>i));
      perform pg_temp.network_add_integrity_signal(v_anchor,'review_integrity_coordinated_copy',
        jsonb_build_object('distinct_users_same_text_30m',3,'window_minutes',30));
    end loop;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
  end loop;
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_coordinated_content_similarity'),
    'one Sprint 8 coordinated-copy Spot remains below Network threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_coordinated_content_similarity'
      and (evidence->>'distinct_spot_count')::integer=2),'two Integrity-evidenced Spots meet content threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='network_coordinated_content_similarity'
      and (evidence->>'distinct_spot_count')::integer=3),'three Integrity-evidenced Spots remain above threshold');
  for i in 1..3 loop
    perform pg_temp.network_add_review(v_control,pg_temp.network_uuid('network-spot:'||(55+i)),
      'Similar but independently unevidenced text',v_now-make_interval(days=>i));
  end loop;
  perform public.account_trust_evaluate_network_user_v1(v_control,v_now);
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_control and signal_key='network_coordinated_content_similarity'),
    'similar content without Sprint 8 evidence cannot fabricate a Network signal');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'content-similarity evaluation is idempotent');
end;
$$;

-- Dense mutual engagement: ten is below, 12 is exactly at threshold, and an
-- ordinary friend group with light reciprocity remains a control.
do $$
declare
  v_now timestamptz:=now();j integer;i integer;v_primary uuid;v_peer uuid;v_my_review uuid;v_peer_review uuid;
  v_below uuid:=pg_temp.network_make_user('mutual-below',v_now-interval '100 days');
  v_at uuid:=pg_temp.network_make_user('mutual-at',v_now-interval '100 days');
  v_above uuid:=pg_temp.network_make_user('mutual-above',v_now-interval '100 days');
  v_friend uuid:=pg_temp.network_make_user('mutual-friend-control',v_now-interval '500 days');v_count integer;
begin
  for j in 1..3 loop
    v_primary:=case j when 1 then v_below when 2 then v_at else v_above end;
    for i in 1..(case j when 3 then 4 else 3 end) loop
      v_peer:=pg_temp.network_make_user('mutual-peer-'||j||'-'||i,v_now-interval '100 days');
      v_my_review:=pg_temp.network_add_review(v_primary,pg_temp.network_uuid('network-spot:60'),'My mutual '||j||'-'||i,v_now-interval '3 days');
      v_peer_review:=pg_temp.network_add_review(v_peer,pg_temp.network_uuid('network-spot:61'),'Peer mutual '||j||'-'||i,v_now-interval '3 days');
      insert into public.review_likes(user_id,review_id,created_at) values
        (v_primary,v_peer_review,v_now-interval '2 days'),(v_peer,v_my_review,v_now-interval '2 days');
      if j<>1 or i<=2 then
        v_my_review:=pg_temp.network_add_review(v_primary,pg_temp.network_uuid('network-spot:62'),'My mutual second '||j||'-'||i,v_now-interval '1 day');
        v_peer_review:=pg_temp.network_add_review(v_peer,pg_temp.network_uuid('network-spot:63'),'Peer mutual second '||j||'-'||i,v_now-interval '1 day');
        insert into public.review_likes(user_id,review_id,created_at) values
          (v_primary,v_peer_review,v_now-interval '1 day'),(v_peer,v_my_review,v_now-interval '1 day');
      end if;
    end loop;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
  end loop;
  -- Three established friends with only one event each direction (six total).
  for i in 1..3 loop
    v_peer:=pg_temp.network_make_user('natural-friend-'||i,v_now-interval '500 days');
    v_my_review:=pg_temp.network_add_review(v_friend,pg_temp.network_uuid('network-spot:64'),'Friend author '||i,v_now-interval '10 days');
    v_peer_review:=pg_temp.network_add_review(v_peer,pg_temp.network_uuid('network-spot:65'),'Friend peer '||i,v_now-interval '10 days');
    insert into public.review_likes(user_id,review_id,created_at) values
      (v_friend,v_peer_review,v_now-interval '9 days'),(v_peer,v_my_review,v_now-interval '9 days');
  end loop;
  perform public.account_trust_evaluate_network_user_v1(v_friend,v_now);
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_mutual_engagement_cluster'),
    'mutual engagement remains below threshold without three qualifying peers and twelve events');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_mutual_engagement_cluster'
      and (evidence->>'reciprocal_event_count')::integer=12),'twelve reciprocal events across three peers meet threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='network_mutual_engagement_cluster'
      and (evidence->>'reciprocal_event_count')::integer=16),'four qualifying peers remain above threshold');
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_friend and signal_key in('network_mutual_engagement_cluster','network_engagement_ring')),
    'natural friend engagement remains below cluster and ring thresholds');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'mutual engagement evaluation is idempotent');
end;
$$;

-- Repeated targeting requires three shared days and independent relationship
-- evidence. One shared outing and two shared days are controls.
do $$
declare
  v_now timestamptz:=now();
  v_review_anchor timestamptz:=(date_trunc('day',v_now at time zone 'UTC')-interval '1 day'+interval '12 hours') at time zone 'UTC';
  j integer;i integer;v_primary uuid;v_peer uuid;v_spot uuid;v_count integer;
  v_below uuid:=pg_temp.network_make_user('target-below',v_now-interval '100 days');
  v_below_peer uuid:=pg_temp.network_make_user('target-below-peer',v_now-interval '100 days');
  v_at uuid:=pg_temp.network_make_user('target-at',v_now-interval '100 days');
  v_at_peer uuid:=pg_temp.network_make_user('target-at-peer',v_now-interval '100 days');
  v_above uuid:=pg_temp.network_make_user('target-above',v_now-interval '100 days');
  v_above_peer uuid:=pg_temp.network_make_user('target-above-peer',v_now-interval '100 days');
  v_once uuid:=pg_temp.network_make_user('target-once',v_now-interval '100 days');
  v_once_peer uuid:=pg_temp.network_make_user('target-once-peer',v_now-interval '100 days');
begin
  for j in 1..3 loop
    v_primary:=case j when 1 then v_below when 2 then v_at else v_above end;
    v_peer:=case j when 1 then v_below_peer when 2 then v_at_peer else v_above_peer end;
    v_spot:=pg_temp.network_uuid('network-spot:'||(66+j));
    perform public.account_trust_record_technical_identity_v1(v_primary,pg_temp.network_uuid('target-install-'||j),v_now);
    perform public.account_trust_record_technical_identity_v1(v_peer,pg_temp.network_uuid('target-install-'||j),v_now);
    for i in 1..(j+1) loop
      perform pg_temp.network_add_review(v_primary,v_spot,'Target primary '||i,v_review_anchor-make_interval(days=>i));
      perform pg_temp.network_add_review(v_peer,v_spot,'Target peer '||i,v_review_anchor-make_interval(days=>i)+interval '2 hours');
    end loop;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
  end loop;
  perform public.account_trust_record_technical_identity_v1(v_once,pg_temp.network_uuid('target-once-install'),v_now);
  perform public.account_trust_record_technical_identity_v1(v_once_peer,pg_temp.network_uuid('target-once-install'),v_now);
  perform pg_temp.network_add_review(v_once,pg_temp.network_uuid('network-spot:70'),'One outing A',v_now-interval '1 day');
  perform pg_temp.network_add_review(v_once_peer,pg_temp.network_uuid('network-spot:70'),'One outing B',v_now-interval '1 day');
  perform public.account_trust_evaluate_network_user_v1(v_once,v_now);
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_coordinated_spot_targeting'),
    'two shared target days remain below threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_coordinated_spot_targeting'
      and (evidence->>'shared_target_days')::integer=3),'three related shared target days meet threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='network_coordinated_spot_targeting'
      and (evidence->>'shared_target_days')::integer=4),'four shared target days remain above threshold');
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_once and signal_key='network_coordinated_spot_targeting'),
    'one shared Spot outing remains normal');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'targeting evaluation is idempotent');
end;
$$;

-- Repeated group is an aggregation of Sprint 8 evidence, not a duplicate group detector.
do $$
declare
  v_now timestamptz:=now();i integer;v_primary uuid;v_a uuid;v_b uuid;v_anchor uuid;v_spot uuid;v_count integer;
  v_below uuid:=pg_temp.network_make_user('group-below',v_now-interval '100 days');
  v_at uuid:=pg_temp.network_make_user('group-at',v_now-interval '100 days');
  v_at_a uuid:=pg_temp.network_make_user('group-at-a',v_now-interval '100 days');
  v_at_b uuid:=pg_temp.network_make_user('group-at-b',v_now-interval '100 days');
  v_above uuid:=pg_temp.network_make_user('group-above',v_now-interval '100 days');
  v_above_a uuid:=pg_temp.network_make_user('group-above-a',v_now-interval '100 days');
  v_above_b uuid:=pg_temp.network_make_user('group-above-b',v_now-interval '100 days');
begin
  perform public.account_trust_evaluate_network_user_v1(v_below,v_now);
  for i in 1..2 loop
    v_primary:=case when i=1 then v_at else v_above end;
    v_a:=case when i=1 then v_at_a else v_above_a end;
    v_b:=case when i=1 then v_at_b else v_above_b end;
    v_spot:=pg_temp.network_uuid('network-spot:'||(70+i));
    perform pg_temp.network_add_review(v_a,v_spot,'Repeated group A',v_now-make_interval(days=>i)-interval '2 minutes');
    perform pg_temp.network_add_review(v_b,v_spot,'Repeated group B',v_now-make_interval(days=>i)-interval '1 minute');
    v_anchor:=pg_temp.network_add_review(v_primary,v_spot,'Repeated group anchor',v_now-make_interval(days=>i));
    perform pg_temp.network_add_integrity_signal(v_anchor,'review_integrity_repeated_group_pattern',
      jsonb_build_object('current_group_users',3,'prior_coordinated_spots',i,'group_window_minutes',60));
    if i=2 then
      v_spot:=pg_temp.network_uuid('network-spot:73');
      perform pg_temp.network_add_review(v_above_a,v_spot,'Repeated group A2',v_now-interval '4 days');
      perform pg_temp.network_add_review(v_above_b,v_spot,'Repeated group B2',v_now-interval '4 days');
      v_anchor:=pg_temp.network_add_review(v_above,v_spot,'Repeated group anchor2',v_now-interval '4 days');
      perform pg_temp.network_add_integrity_signal(v_anchor,'review_integrity_repeated_group_pattern',
        '{"current_group_users":3,"prior_coordinated_spots":2,"group_window_minutes":60}'::jsonb);
    end if;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
  end loop;
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_repeated_account_group'),
    'no Sprint 8 repeated-group evidence emits no Network group signal');
  perform pg_temp.network_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_repeated_account_group'),
    'one Sprint 8 repeated-group signal meets threshold');
  perform pg_temp.network_assert((select count(*)=2 from public.account_trust_signals
    where user_id=v_above and signal_key='network_repeated_account_group'),
    'two distinct Sprint 8 group events remain auditable above threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'repeated-group evaluation is idempotent');
end;
$$;

-- New-account cluster requires at least three new related accounts and two
-- independent evidence families. Shared installation alone is insufficient.
do $$
declare
  v_now timestamptz:=now();j integer;i integer;v_primary uuid;v_a uuid;v_b uuid;v_install uuid;v_spot uuid;v_anchor uuid;
  v_below uuid:=pg_temp.network_make_user('new-cluster-below',v_now-interval '4 days');
  v_below_a uuid:=pg_temp.network_make_user('new-cluster-below-a',v_now-interval '4 days');
  v_below_b uuid:=pg_temp.network_make_user('new-cluster-below-b',v_now-interval '4 days');
  v_at uuid:=pg_temp.network_make_user('new-cluster-at',v_now-interval '4 days');
  v_at_a uuid:=pg_temp.network_make_user('new-cluster-at-a',v_now-interval '4 days');
  v_at_b uuid:=pg_temp.network_make_user('new-cluster-at-b',v_now-interval '4 days');
  v_above uuid:=pg_temp.network_make_user('new-cluster-above',v_now-interval '4 days');
  v_above_a uuid:=pg_temp.network_make_user('new-cluster-above-a',v_now-interval '4 days');
  v_above_b uuid:=pg_temp.network_make_user('new-cluster-above-b',v_now-interval '4 days');v_count integer;
begin
  for j in 1..3 loop
    v_primary:=case j when 1 then v_below when 2 then v_at else v_above end;
    v_a:=case j when 1 then v_below_a when 2 then v_at_a else v_above_a end;
    v_b:=case j when 1 then v_below_b when 2 then v_at_b else v_above_b end;
    v_install:=pg_temp.network_uuid('new-cluster-install-'||j);
    perform public.account_trust_record_technical_identity_v1(v_primary,v_install,v_now);
    perform public.account_trust_record_technical_identity_v1(v_a,v_install,v_now);
    perform public.account_trust_record_technical_identity_v1(v_b,v_install,v_now);
    if j>=2 then
      for i in 1..2 loop
        v_spot:=pg_temp.network_uuid('network-spot:'||(73+j*2+i));
        perform pg_temp.network_add_review(v_primary,v_spot,'New primary '||i,v_now-make_interval(hours=>i));
        perform pg_temp.network_add_review(v_a,v_spot,'New A '||i,v_now-make_interval(hours=>i)+interval '2 minutes');
        perform pg_temp.network_add_review(v_b,v_spot,'New B '||i,v_now-make_interval(hours=>i)+interval '4 minutes');
      end loop;
    end if;
    if j=3 then
      v_spot:=pg_temp.network_uuid('network-spot:80');
      perform pg_temp.network_add_review(v_a,v_spot,'New coordinated content',v_now-interval '3 hours');
      perform pg_temp.network_add_review(v_b,v_spot,'New coordinated content',v_now-interval '2 hours 59 minutes');
      v_anchor:=pg_temp.network_add_review(v_primary,v_spot,'New coordinated content',v_now-interval '2 hours 58 minutes');
      perform pg_temp.network_add_integrity_signal(v_anchor,'review_integrity_coordinated_copy',
        '{"distinct_users_same_text_30m":3,"window_minutes":30}'::jsonb);
    end if;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
  end loop;
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_new_account_cluster'),
    'three new shared-installation accounts with only one common feature do not form a strong cluster');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_new_account_cluster'
      and (evidence->>'aligned_evidence_family_count')::integer=2),
    'three new accounts and exactly two aligned evidence families meet threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='network_new_account_cluster'
      and (evidence->>'aligned_evidence_family_count')::integer>=3),
    'a third independent evidence family remains above threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'new-cluster evaluation is idempotent');
end;
$$;

-- Engagement ring: persistent 4-6 account reciprocity plus independent
-- coordination. A natural friend group or reciprocity alone is insufficient.
do $$
declare
  v_now timestamptz:=now();j integer;i integer;k integer;v_primary uuid;v_peer uuid;v_my_review uuid;v_peer_review uuid;
  v_below uuid:=pg_temp.network_make_user('ring-below',v_now-interval '500 days');
  v_at uuid:=pg_temp.network_make_user('ring-at',v_now-interval '100 days');
  v_above uuid:=pg_temp.network_make_user('ring-above',v_now-interval '100 days');
  v_spot uuid;v_day integer;v_count integer;
begin
  for j in 1..3 loop
    v_primary:=case j when 1 then v_below when 2 then v_at else v_above end;
    for i in 1..(case when j=3 then 4 else 3 end) loop
      v_peer:=pg_temp.network_make_user('ring-peer-'||j||'-'||i,v_now-interval '100 days');
      for k in 1..(case when j=1 then 3 else 4 end) loop
        v_day:=case k when 1 then 8 when 2 then 5 when 3 then 2 else 0 end;
        v_my_review:=pg_temp.network_add_review(v_primary,pg_temp.network_uuid('network-spot:1'),
          'Ring primary '||j||'-'||i||'-'||k,v_now-make_interval(days=>v_day));
        v_peer_review:=pg_temp.network_add_review(v_peer,pg_temp.network_uuid('network-spot:2'),
          'Ring peer '||j||'-'||i||'-'||k,v_now-make_interval(days=>v_day));
        insert into public.review_likes(user_id,review_id,created_at) values
          (v_primary,v_peer_review,v_now-make_interval(days=>v_day)),
          (v_peer,v_my_review,v_now-make_interval(days=>v_day));
      end loop;
    end loop;
    -- Independent coordination: the primary and one peer share three Spots.
    v_peer:=pg_temp.network_uuid('network-user:ring-peer-'||j||'-1');
    for k in 1..3 loop
      v_spot:=pg_temp.network_uuid('network-spot:'||(10+j*3+k));
      perform pg_temp.network_add_review(v_primary,v_spot,'Ring overlap primary '||k,v_now-make_interval(days=>k));
      perform pg_temp.network_add_review(v_peer,v_spot,'Ring overlap peer '||k,v_now-make_interval(days=>k)+interval '3 minutes');
    end loop;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
  end loop;
  perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='network_engagement_ring'),
    'eighteen reciprocal events remain below the ring threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='network_engagement_ring'
      and (evidence->>'group_account_count')::integer=4
      and (evidence->>'reciprocal_event_count')::integer>=24),
    'four accounts, twenty-four reciprocal events, seven days, and coordination meet ring threshold');
  perform pg_temp.network_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='network_engagement_ring'
      and (evidence->>'group_account_count')::integer=5
      and (evidence->>'reciprocal_event_count')::integer>=32),
    'five accounts and thirty-two reciprocal events remain above ring threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='network';
  perform public.account_trust_evaluate_network_user_v1(v_at,v_now);
  perform pg_temp.network_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='network')=v_count,'engagement-ring evaluation is idempotent');
end;
$$;

-- Additional legitimate network controls. Household/shared-device, ordinary
-- friends, a popular new restaurant, and an established local friend group are
-- covered above. These fixtures cover workplace, university, tourist-group,
-- and festival usage without inventing infrastructure or location signals.
do $$
declare
  v_now timestamptz:=now();v_scenario integer;v_peer_index integer;v_spot_index integer;
  v_primary uuid;v_peer uuid;v_spot uuid;v_peer_count integer;v_spot_count integer;
begin
  for v_scenario in 1..4 loop
    v_peer_count:=case v_scenario when 1 then 6 when 2 then 8 when 3 then 6 else 12 end;
    v_spot_count:=case v_scenario when 2 then 1 else 2 end;
    v_primary:=pg_temp.network_make_user('legitimate-primary-'||v_scenario,v_now-interval '400 days');
    for v_spot_index in 1..v_spot_count loop
      v_spot:=pg_temp.network_uuid('network-spot:'||(85+v_scenario*2+v_spot_index));
      perform pg_temp.network_add_review(v_primary,v_spot,
        'Independent primary '||v_scenario||'-'||v_spot_index,
        v_now-interval '5 days'+make_interval(mins=>v_spot_index));
      for v_peer_index in 1..v_peer_count loop
        if v_spot_index=1 then
          v_peer:=pg_temp.network_make_user(
            'legitimate-peer-'||v_scenario||'-'||v_peer_index,v_now-interval '400 days');
        else
          v_peer:=pg_temp.network_uuid(
            'network-user:legitimate-peer-'||v_scenario||'-'||v_peer_index);
        end if;
        perform pg_temp.network_add_review(v_peer,v_spot,
          'Independent peer '||v_scenario||'-'||v_peer_index||'-'||v_spot_index,
          v_now-interval '5 days'+make_interval(mins=>v_peer_index+v_spot_index));
      end loop;
    end loop;
    perform public.account_trust_evaluate_network_user_v1(v_primary,v_now);
    perform pg_temp.network_assert(not exists(select 1 from public.account_trust_signals
      where user_id=v_primary and dimension='network'),
      case v_scenario
        when 1 then 'coworkers visiting nearby Spots do not form an artificial network'
        when 2 then 'university users sharing one popular Spot do not form an artificial network'
        when 3 then 'a tourist group sharing attractions does not form an artificial network'
        else 'a festival burst across shared Spots does not form an artificial network'
      end);
  end loop;
end;
$$;

-- Generic Admin contract, least privilege, RLS, privacy, scheduling, and no
-- enforcement/ranking/Owner side effects.
do $$
declare
  v_now timestamptz:=now();
  v_admin uuid:=pg_temp.network_make_user('network-admin',v_now-interval '100 days');
  v_normal uuid:=pg_temp.network_make_user('network-normal',v_now-interval '100 days');
  v_target uuid:=pg_temp.network_uuid('network-user:shared-at-a');v_detail jsonb;
begin
  update public.profiles set is_admin=true where id=v_admin;
  perform pg_temp.network_set_actor(v_admin);
  v_detail:=public.account_trust_admin_detail_v1(v_target);
  perform pg_temp.network_assert(
    (v_detail->'score'->'dimension_scores'->>'network') is not null
    and exists(select 1 from jsonb_array_elements(v_detail->'signals') s
      where s->>'signal_key'='network_shared_installation'
        and s->>'detector_version'='1.0.0'
        and (s->'evidence'->>'associated_account_count')::integer=2),
    'existing Admin contract exposes Network score, evidence, reason, version, and timestamps'
  );
  perform pg_temp.network_set_actor(v_normal);
  perform pg_temp.network_assert(
    not has_function_privilege('authenticated','public.account_trust_network_hash_uuid_v1(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_network_engagement_edges_v1(timestamp with time zone,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_evaluate_network_user_v1(uuid,timestamp with time zone)','EXECUTE')
    and not has_function_privilege('authenticated','public.account_trust_evaluate_network_due_v1(integer,timestamp with time zone)','EXECUTE'),
    'normal users cannot fabricate relationships, emit signals, or call Network detectors'
  );
  perform pg_temp.network_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'account_trust_network_%'
      and p.prosecdef and (p.proconfig is null or not exists(
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  ),'all Network SECURITY DEFINER functions have explicit search_path');
  perform pg_temp.network_assert(not exists(
    select 1 from (values('account_trust_network_detector_config'),('account_trust_network_evaluation_state')) t(table_name)
    join pg_class c on c.relname=t.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    where not c.relrowsecurity
  ),'RLS is enabled for Network configuration and scheduling state');
  perform pg_temp.network_assert(not exists(
    select 1 from (values('account_trust_network_detector_config'),('account_trust_network_evaluation_state')) t(table_name)
    where has_table_privilege('anon','public.'||t.table_name,'SELECT')
       or has_table_privilege('authenticated','public.'||t.table_name,'SELECT,INSERT,UPDATE,DELETE')
  ),'client roles cannot read or mutate private Network detector state');
  perform pg_temp.network_assert(exists(select 1 from cron.job
    where jobname='backyrd-account-trust-network-daily' and active and schedule='59 3 * * *'
      and command like '%account_trust_evaluate_network_due_v1(1000, now())%'),
    'one secret-free daily Network evaluation job exists');
  perform pg_temp.network_assert(not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name like 'account_trust_network%'
      and column_name in('ip','ip_address','wifi','mac_address','device_id','fingerprint',
        'advertising_id','latitude','longitude','contact_hash','installation_id')),
    'Network Trust stores no invasive or raw technical identifiers');
  perform pg_temp.network_assert(not exists(
    select 1 from public.account_trust_signals s
    join public.account_trust_signal_registry r on r.signal_key=s.signal_key
    where s.dimension='network'
      and s.expires_at is distinct from s.observed_at+r.default_ttl
  ),'every emitted Network signal uses the versioned registry TTL');
  perform pg_temp.network_assert(
    (select count(*) from public.safety_account_enforcements)=(select enforcements from network_side_effect_baseline)
    and (select count(*) from public.safety_account_measures)=(select measures from network_side_effect_baseline)
    and (select count(*) from public.safety_user_enforcement_events)=(select user_events from network_side_effect_baseline)
    and (select count(*) from public.safety_enforcement_events)=(select enforcement_events from network_side_effect_baseline)
    and (select count(*) from public.ranking_config)=(select ranking_rows from network_side_effect_baseline),
    'Network Trust creates no punishment, Safety enforcement, ranking, visibility, Distribution, or Owner side effect'
  );
end;
$$;

alter table public.reviews enable trigger user;
rollback;

\echo 'Sprint 9.3 Network Trust Signals acceptance passed.'
