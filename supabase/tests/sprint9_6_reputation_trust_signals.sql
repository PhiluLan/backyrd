\set ON_ERROR_STOP on

begin;

set local client_min_messages=error;

create function pg_temp.rep_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.rep_assert(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9.6 Reputation acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.rep_user(p_label text,p_age_days integer) returns uuid
language plpgsql as $$
declare v_id uuid:=pg_temp.rep_uuid('rep-user:'||p_label);v_created timestamptz:=now()-make_interval(days=>p_age_days);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@sprint96.invalid','',v_created,'{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,v_created,v_created,'','','',''
  );
  update public.profiles set created_at=v_created where id=v_id;
  return v_id;
end;
$$;

create function pg_temp.rep_spot(p_label text) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.rep_uuid('rep-spot:'||p_label);
begin
  insert into public.spots(id,name,address,lat,lng,status,city,country)
  values(v_id,'Reputation '||p_label,'Test 1',47.55,7.59,'approved','Basel','Switzerland')
  on conflict(id) do nothing;
  return v_id;
end;
$$;

create function pg_temp.rep_review(
  p_user uuid,p_label text,p_spot uuid,p_created timestamptz
) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.rep_uuid('rep-review:'||p_label);
begin
  insert into public.reviews(id,spot_id,user_id,text,created_at,updated_at)
  values(v_id,p_spot,p_user,'Synthetic healthy contribution '||p_label,p_created,p_created);
  return v_id;
end;
$$;

create function pg_temp.rep_add_usage(
  p_user uuid,p_label text,p_days integer,p_months integer,p_features integer
) returns void language plpgsql as $$
declare v_i integer;v_when timestamptz;v_spot uuid:=pg_temp.rep_spot('usage-'||p_label);
begin
  for v_i in 1..p_days loop
    v_when:=now()-make_interval(days=>greatest(1,least(350,v_i*27)));
    insert into public.user_searches(user_id,query,created_at) values(p_user,'synthetic',v_when);
  end loop;
  if p_features>=2 then
    for v_i in 1..greatest(p_months,1) loop
      insert into public.decision_sessions(user_id,city,created_at)
      values(p_user,'Basel',now()-make_interval(days=>least(350,v_i*27)));
    end loop;
  end if;
  if p_features>=3 then
    insert into public.favorites(user_id,spot_id,created_at)
    values(p_user,v_spot,now()-interval '27 days');
  end if;
end;
$$;

create function pg_temp.rep_add_contributions(
  p_user uuid,p_label text,p_count integer,p_spots integer,p_span_days integer
) returns void language plpgsql as $$
declare v_i integer;v_spot uuid;v_when timestamptz;
begin
  for v_i in 1..p_count loop
    v_spot:=pg_temp.rep_spot(p_label||'-'||(((v_i-1)%greatest(p_spots,1))+1));
    v_when:=now()-make_interval(days=>case when p_count=1 then 1
      else 30+round(((v_i-1)::numeric/(p_count-1))*p_span_days)::integer end);
    perform pg_temp.rep_review(p_user,p_label||'-'||v_i,v_spot,v_when);
  end loop;
end;
$$;

create function pg_temp.rep_add_reports(
  p_user uuid,p_label text,p_total integer,p_actioned integer,p_span_days integer
) returns void language plpgsql as $$
declare v_i integer;v_content uuid;v_when timestamptz;
begin
  for v_i in 1..p_total loop
    v_content:=pg_temp.rep_uuid('rep-report-content:'||p_label||':'||v_i);
    v_when:=now()-make_interval(days=>case when p_total=1 then 1
      else 20+round(((v_i-1)::numeric/(p_total-1))*p_span_days)::integer end);
    insert into public.safety_content_items(
      id,content_type,entity_type,entity_id,actor_user_id,lifecycle_status,created_at,updated_at
    ) values(v_content,'text','review',pg_temp.rep_uuid('reported:'||p_label||':'||v_i),
      null,'live',v_when,v_when);
    insert into public.safety_user_reports(
      content_item_id,reporter_user_id,report_reason,report_status,reviewed_at,created_at,updated_at
    ) values(v_content,p_user,'spam_fraud',case when v_i<=p_actioned then 'resolved_actioned' else 'resolved_no_violation' end,
      v_when,v_when-interval '1 day',v_when);
  end loop;
end;
$$;

do $$
begin
  perform pg_temp.rep_assert((select count(*)=8 from public.account_trust_signal_registry where dimension='reputation'),
    'all eight Reputation signals are registered');
  perform pg_temp.rep_assert((select count(*)=8 from public.account_trust_reputation_detector_config
    where enabled and detector_version='1.0.0'),'all detectors are versioned and enabled');
  perform pg_temp.rep_assert((select array_agg(milestone_days order by milestone_days)=array[30,90,180,365,730]
    from public.account_trust_reputation_milestones),'tenure milestones are canonical');
end;
$$;

-- Tenure boundaries and idempotency. New users remain neutral; age alone is modest.
do $$
declare v_below uuid:=pg_temp.rep_user('tenure-below',29);v_at uuid:=pg_temp.rep_user('tenure-at',30);
  v_above uuid:=pg_temp.rep_user('tenure-above',731);v_count integer;
begin
  perform public.account_trust_evaluate_reputation_user_v1(v_below,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_at,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_above,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_below and dimension='reputation'),
    '29-day account stays neutral');
  perform pg_temp.rep_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_at and signal_key='reputation_account_tenure'),'exactly 30 days emits one modest milestone');
  perform pg_temp.rep_assert((select count(*)=5 from public.account_trust_signals
    where user_id=v_above and signal_key='reputation_account_tenure'),'731 days emits all five milestones');
  select count(*) into v_count from public.account_trust_signals where user_id=v_above;
  perform public.account_trust_evaluate_reputation_user_v1(v_above,now());
  perform pg_temp.rep_assert((select count(*) from public.account_trust_signals where user_id=v_above)=v_count,
    'tenure re-evaluation is idempotent');
end;
$$;

-- Consistency threshold: 11 active days are below; 12 days, four months,
-- three feature families, Decision and Spot-linked use are exact.
do $$
declare v_below uuid:=pg_temp.rep_user('participation-below',400);
  v_at uuid:=pg_temp.rep_user('participation-at',400);v_above uuid:=pg_temp.rep_user('participation-above',400);
begin
  perform pg_temp.rep_add_usage(v_below,'participation-below',11,4,3);
  perform pg_temp.rep_add_usage(v_at,'participation-at',12,4,3);
  perform pg_temp.rep_add_usage(v_above,'participation-above',16,5,3);
  perform public.account_trust_evaluate_reputation_user_v1(v_below,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_at,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_above,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_below
    and signal_key='reputation_consistent_participation'),'11 active days are below threshold');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_at
    and signal_key='reputation_consistent_participation'),'exact participation boundary emits');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_above
    and signal_key='reputation_consistent_participation'),'above participation boundary emits');
end;
$$;

-- Quality and Review Trust boundaries: four contributions over three Spots and
-- 180 days; five Reviews over four Spots and 180 days. Raw volume without time fails.
do $$
declare v_quality_below uuid:=pg_temp.rep_user('quality-below',500);
  v_quality_at uuid:=pg_temp.rep_user('quality-at',500);v_quality_above uuid:=pg_temp.rep_user('quality-above',500);
  v_review_below uuid:=pg_temp.rep_user('reviews-below',500);v_review_at uuid:=pg_temp.rep_user('reviews-at',500);
  v_review_above uuid:=pg_temp.rep_user('reviews-above',500);v_fast uuid:=pg_temp.rep_user('reviews-fast',7);
begin
  perform pg_temp.rep_add_contributions(v_quality_below,'quality-below',3,3,180);
  perform pg_temp.rep_add_contributions(v_quality_at,'quality-at',4,3,180);
  perform pg_temp.rep_add_contributions(v_quality_above,'quality-above',6,5,240);
  perform pg_temp.rep_add_contributions(v_review_below,'reviews-below',4,4,180);
  perform pg_temp.rep_add_contributions(v_review_at,'reviews-at',5,4,180);
  perform pg_temp.rep_add_contributions(v_review_above,'reviews-above',7,6,240);
  perform pg_temp.rep_add_contributions(v_fast,'reviews-fast',20,10,5);
  perform public.account_trust_evaluate_reputation_user_v1(v_quality_below,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_quality_at,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_quality_above,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_review_below,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_review_at,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_review_above,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_fast,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_quality_below
    and signal_key='reputation_quality_contributor'),'three contributions are below quality threshold');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_quality_at
    and signal_key='reputation_quality_contributor'),'quality exact boundary emits');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_quality_above
    and signal_key='reputation_quality_contributor'),'quality above boundary emits');
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_review_below
    and signal_key='reputation_trusted_review_history'),'four Reviews are below trusted-history threshold');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_review_at
    and signal_key='reputation_trusted_review_history'),'trusted Review exact boundary emits');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_review_above
    and signal_key='reputation_trusted_review_history'),'trusted Review above boundary emits');
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_fast
    and signal_key in ('reputation_quality_contributor','reputation_trusted_review_history')),
    'one-week high volume cannot manufacture long-term Reputation');
end;
$$;

-- Healthy social requires eight outbound actions, four counterparties, three
-- months and three action families. Received popularity is never counted.
do $$
declare v_below uuid:=pg_temp.rep_user('social-below',400);v_at uuid:=pg_temp.rep_user('social-at',400);
  v_popular uuid:=pg_temp.rep_user('popular',400);v_cp uuid;v_review uuid;v_spot uuid;v_i integer;v_when timestamptz;
begin
  v_spot:=pg_temp.rep_spot('social');
  for v_i in 1..4 loop
    v_cp:=pg_temp.rep_user('social-cp-'||v_i,500);
    v_review:=pg_temp.rep_review(v_cp,'social-cp-'||v_i,v_spot,now()-interval '200 days');
    v_when:=now()-make_interval(days=>30+((v_i-1)%3)*90);
    insert into public.follows(follower,following,created_at) values(v_at,v_cp,v_when);
    insert into public.review_likes(user_id,review_id,created_at) values(v_at,v_review,v_when+interval '1 hour');
    if v_i<=3 then
      insert into public.review_comments(review_id,user_id,text,created_at)
      values(v_review,v_at,'Synthetic social interaction',v_when+interval '2 hours');
    end if;
    if v_i<=3 then
      insert into public.follows(follower,following,created_at)
      values(v_below,v_cp,v_when+interval '3 hours');
    end if;
    insert into public.follows(follower,following,created_at) values(v_cp,v_popular,v_when);
  end loop;
  perform public.account_trust_evaluate_reputation_user_v1(v_below,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_at,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_popular,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_below
    and signal_key='reputation_healthy_social'),'below social threshold does not emit');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_at
    and signal_key='reputation_healthy_social'),'diverse outbound social history emits');
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_popular
    and signal_key='reputation_healthy_social'),'followers received create no Reputation shortcut');
end;
$$;

-- Reliable Reporter uses multiple human-resolved reports. Four are below;
-- five with four substantiated across 90 days are exact; abuse evidence blocks it.
do $$
declare v_below uuid:=pg_temp.rep_user('reporter-below',400);v_at uuid:=pg_temp.rep_user('reporter-at',400);
  v_above uuid:=pg_temp.rep_user('reporter-above',400);v_abuse uuid:=pg_temp.rep_user('reporter-abuse',400);
begin
  perform pg_temp.rep_add_reports(v_below,'reporter-below',4,4,90);
  perform pg_temp.rep_add_reports(v_at,'reporter-at',5,4,90);
  perform pg_temp.rep_add_reports(v_above,'reporter-above',8,7,180);
  perform pg_temp.rep_add_reports(v_abuse,'reporter-abuse',5,5,90);
  insert into public.safety_report_abuse_events(reporter_user_id,event_type,created_at)
  values(v_abuse,'duplicate_report_blocked',now()-interval '5 days');
  perform public.account_trust_evaluate_reputation_user_v1(v_below,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_at,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_above,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_abuse,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_below
    and signal_key='reputation_reliable_reporter'),'four resolved reports are below threshold');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_at
    and signal_key='reputation_reliable_reporter'),'exact reporter threshold emits');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_above
    and signal_key='reputation_reliable_reporter'),'above reporter threshold emits');
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_abuse
    and signal_key='reputation_reliable_reporter'),'report-abuse evidence prevents reliable-reporter signal');
end;
$$;

-- Clean history requires enough observation; low-volume long-term contribution
-- can qualify, while inactivity cannot. Community requires three independent
-- positive families including contribution and clean-history evidence.
do $$
declare v_quiet uuid:=pg_temp.rep_user('quiet-years',800);v_at uuid:=pg_temp.rep_user('clean-at',500);
  v_community uuid:=pg_temp.rep_user('community',500);v_cfg record;v_count integer;
begin
  perform pg_temp.rep_add_usage(v_at,'clean-at',12,4,3);
  perform pg_temp.rep_add_contributions(v_at,'clean-at',4,3,180);
  perform public.account_trust_evaluate_reputation_user_v1(v_quiet,now());
  perform public.account_trust_evaluate_reputation_user_v1(v_at,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_quiet
    and signal_key='reputation_clean_history'),'inactivity is not positive clean-history evidence');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_at
    and signal_key='reputation_clean_history'),'exact observation threshold emits clean history');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_at
    and signal_key='reputation_reliable_community_member'),'three independent families yield community history');

  -- Build exactly two families first: community must remain absent.
  for v_cfg in select * from (values
    ('reputation_quality_contributor','backyrd.reputation.quality_contributor'),
    ('reputation_clean_history','backyrd.reputation.clean_history')) x(signal_key,detector_key)
  loop
    perform public.account_trust_emit_signal_v1(v_community,v_cfg.signal_key,v_cfg.detector_key,'1.0.0',0.8,0.9,
      now(),now()+interval '180 days','manual-fixture:'||v_cfg.signal_key,'{}','{}');
  end loop;
  perform public.account_trust_evaluate_reputation_user_v1(v_community,now());
  perform pg_temp.rep_assert(not exists(select 1 from public.account_trust_signals where user_id=v_community
    and signal_key='reputation_reliable_community_member'),'two positive families are below community threshold');
  perform public.account_trust_emit_signal_v1(v_community,'reputation_consistent_participation',
    'backyrd.reputation.consistent_participation','1.0.0',0.8,0.9,now(),now()+interval '180 days',
    'manual-fixture:consistent','{}','{}');
  perform public.account_trust_evaluate_reputation_user_v1(v_community,now());
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_community
    and signal_key='reputation_reliable_community_member'),'exactly three eligible families emit community signal');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at;
  perform public.account_trust_evaluate_reputation_user_v1(v_at,now());
  perform pg_temp.rep_assert((select count(*) from public.account_trust_signals where user_id=v_at)=v_count,
    'full Reputation evaluation is idempotent');
end;
$$;

-- Automated Review Integrity suspicion is audit evidence, not confirmed abuse:
-- already-earned Reputation is retained. A non-reversed human-confirmed serious
-- review decision revokes relevant signals and leaves the audit trail intact.
do $$
declare v_user uuid:=pg_temp.rep_user('lifecycle',500);v_spot uuid;v_review uuid;v_content uuid;
  v_case uuid:=pg_temp.rep_uuid('rep-case:lifecycle');v_signal uuid;v_before integer;v_event uuid;
  v_reporter uuid:=pg_temp.rep_user('false-reporter',400);
begin
  perform pg_temp.rep_add_usage(v_user,'lifecycle',12,4,3);
  perform pg_temp.rep_add_contributions(v_user,'lifecycle',10,6,240);
  perform public.account_trust_evaluate_reputation_user_v1(v_user,now());
  select id,spot_id into v_review,v_spot from public.reviews where user_id=v_user order by created_at limit 1;
  v_content:=pg_temp.rep_uuid('rep-content:lifecycle');
  insert into public.safety_content_items(id,content_type,entity_type,entity_id,actor_user_id,spot_id,lifecycle_status)
  values(v_content,'text','review',v_review,v_user,v_spot,'live');
  insert into public.safety_cases(id,content_item_id,case_status,priority)
  values(v_case,v_content,'needs_review',80);
  insert into public.safety_signals(case_id,signal_type,provider,categories,scores,flagged)
  values(v_case,'review_integrity_near_duplicate','backyrd_integrity','{"risk_level":"suspicious"}',
    '{"integrity_score":0.7}',true) returning id into v_signal;
  select count(*) into v_before from public.account_trust_signals
    where user_id=v_user and dimension='reputation' and status='active';
  perform public.account_trust_evaluate_reputation_user_v1(v_user,now());
  perform pg_temp.rep_assert((select count(*) from public.account_trust_signals
    where user_id=v_user and dimension='reputation' and status='active')=v_before,
    'automated suspicious Integrity signal does not revoke Reputation');
  insert into public.safety_user_reports(
    content_item_id,case_id,reporter_user_id,report_reason,report_status,reviewed_at
  ) values(v_content,v_case,v_reporter,'spam_fraud','resolved_no_violation',now());
  perform public.account_trust_evaluate_reputation_user_v1(v_user,now());
  perform pg_temp.rep_assert((select count(*) from public.account_trust_signals
    where user_id=v_user and dimension='reputation' and status='active')=v_before,
    'a false report against a healthy user does not reduce Reputation');

  insert into public.safety_decision_events(case_id,action,category,severity,confidence,source,reason_codes)
  values(v_case,'remove','review_integrity',4,0.99,'human_admin',array['HUMAN_REVIEW','CONFIRMED_MANIPULATION'])
  returning id into v_event;
  perform pg_temp.rep_assert(exists(select 1 from public.safety_user_enforcement_events
    where decision_event_id=v_event and event_type='violation_confirmed'),
    'canonical human-decision trigger records confirmed abuse evidence');
  perform public.account_trust_evaluate_reputation_user_v1(v_user,now());
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_user
    and signal_key='reputation_trusted_review_history' and status='revoked'
    and resolution_reason='human_confirmed_review_manipulation'),
    'human-confirmed manipulation revokes trusted Review history');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signal_events e
    join public.account_trust_signals s on s.id=e.signal_id where s.user_id=v_user
    and e.event_type='revoked'),'revocation remains auditable');
  perform pg_temp.rep_assert(exists(select 1 from public.account_trust_signals where user_id=v_user
    and signal_key='reputation_account_tenure' and status='active'),
    'confirmed abuse does not erase factual tenure');
end;
$$;

-- Expired evidence stops contributing and remains auditable. Revalidation can
-- emit a new instance without stacking the expired instance.
do $$
declare v_user uuid:=pg_temp.rep_user('expiry',500);v_id uuid;v_before numeric;v_after numeric;
begin
  select (public.account_trust_emit_signal_v1(v_user,'reputation_consistent_participation',
    'backyrd.reputation.consistent_participation','1.0.0',1,1,now()-interval '200 days',
    now()-interval '1 day','expiry-fixture','{}','{}')->>'signal_id')::uuid into v_id;
  select (dimension_scores->>'reputation')::numeric into v_before from public.account_trust_scores where user_id=v_user;
  perform public.account_trust_recalculate_v1(v_user,v_id,'expiry_acceptance');
  select (dimension_scores->>'reputation')::numeric into v_after from public.account_trust_scores where user_id=v_user;
  perform pg_temp.rep_assert(v_before=(select baseline_score from public.account_trust_engine_versions where status='active')
    and v_after=v_before,
    'expired signal is excluded immediately and does not change the current score');
  perform public.account_trust_refresh_reputation_signal_v1(v_user,'reputation_consistent_participation',
    'backyrd.reputation.consistent_participation','1.0.0',1,1,false,now(),180,'{}','{}');
  perform pg_temp.rep_assert((select status='expired' from public.account_trust_signals where id=v_id),
    'expired lifecycle state is persisted for audit');
end;
$$;

-- Least privilege and no direct product side effects.
do $$
declare v_user uuid:=pg_temp.rep_user('security',500);v_enforcement bigint;v_spots bigint;
begin
  select count(*) into v_enforcement from public.safety_user_enforcement_events;
  select count(*) into v_spots from public.spots;
  perform public.account_trust_evaluate_reputation_user_v1(v_user,now());
  perform pg_temp.rep_assert((select count(*) from public.safety_user_enforcement_events)=v_enforcement,
    'Reputation evaluation creates no enforcement');
  perform pg_temp.rep_assert((select count(*) from public.spots)=v_spots,'Reputation evaluation changes no Spot visibility');
  perform pg_temp.rep_assert(not has_function_privilege('anon',
    'public.account_trust_evaluate_reputation_user_v1(uuid,timestamptz)','EXECUTE'),
    'anonymous users cannot evaluate Reputation');
  perform pg_temp.rep_assert(not has_function_privilege('authenticated',
    'public.account_trust_evaluate_reputation_user_v1(uuid,timestamptz)','EXECUTE'),
    'authenticated users cannot fabricate Reputation');
  perform pg_temp.rep_assert(has_function_privilege('service_role',
    'public.account_trust_evaluate_reputation_user_v1(uuid,timestamptz)','EXECUTE'),
    'service role can run trusted evaluation');
end;
$$;

rollback;

\echo 'Sprint 9.6 Reputation Trust acceptance passed.'
