\set ON_ERROR_STOP on

begin;

create function pg_temp.owner_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.owner_assert(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 9.5 Owner Trust acceptance failed: %',p_message;
  end if;
end;
$$;

create function pg_temp.owner_make_user(p_label text) returns uuid
language plpgsql as $$
declare v_id uuid:=pg_temp.owner_uuid('owner-user:'||p_label);
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) values(
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',
    p_label||'@sprint95.invalid','',now()-interval '500 days',
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
    now()-interval '500 days',now()-interval '500 days','','','',''
  );
  update public.profiles set contact_email=p_label||'@sprint95.invalid' where id=v_id;
  return v_id;
end;
$$;

create function pg_temp.owner_make_spot(
  p_label text,p_owner_id uuid default null,p_complete boolean default true
) returns uuid language plpgsql as $$
declare v_id uuid:=pg_temp.owner_uuid('owner-spot:'||p_label);
begin
  insert into public.spots(
    id,name,address,lat,lng,status,website,phone,email,city,country,owner_id
  ) values(
    v_id,'Spot '||p_label,case when p_complete then 'Teststrasse 1' else null end,
    47.55,7.59,'approved',case when p_complete then 'https://example.invalid' else null end,
    null,null,case when p_complete then 'Basel' else null end,
    case when p_complete then 'Switzerland' else null end,p_owner_id
  );
  return v_id;
end;
$$;

create function pg_temp.owner_add_claim(
  p_user_id uuid,p_spot_id uuid,p_status text,p_reviewed_at timestamptz,
  p_email_verified boolean default true
) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into public.spot_claims(
    spot_id,user_id,status,business_email,business_domain,email_verified_at,
    submitted_at,reviewed_at,created_at,updated_at,rejection_reason
  ) values(
    p_spot_id,p_user_id,p_status,'owner@example.invalid','example.invalid',
    case when p_email_verified then p_reviewed_at else null end,
    p_reviewed_at-interval '1 day',p_reviewed_at,p_reviewed_at-interval '1 day',p_reviewed_at,
    case when p_status in ('rejected','revoked') then 'synthetic invalid claim' else null end
  ) returning id into v_id;
  return v_id;
end;
$$;

create function pg_temp.owner_make_verified(
  p_label text,p_verified_at timestamptz,p_complete boolean default true
) returns uuid language plpgsql as $$
declare v_user uuid:=pg_temp.owner_make_user(p_label);v_spot uuid;
begin
  v_spot:=pg_temp.owner_make_spot(p_label,v_user,p_complete);
  perform pg_temp.owner_add_claim(v_user,v_spot,'approved',p_verified_at,true);
  return v_user;
end;
$$;

create function pg_temp.owner_request(
  p_user uuid,p_label text,p_requested timestamptz,p_due timestamptz,
  p_status text,p_responded timestamptz default null
) returns uuid language sql as $$
  select public.account_trust_upsert_owner_request_v1(
    p_user,p_label,'required_information',p_requested,p_due,p_status,p_responded
  );
$$;

do $$
begin
  perform pg_temp.owner_assert((select count(*)=10
    from public.account_trust_signal_registry where dimension='owner'),
    'all ten Owner signals are registered');
  perform pg_temp.owner_assert((select count(*)=10
    from public.account_trust_owner_detector_config where enabled and detector_version='1.0.0'),
    'all ten Owner detectors are versioned and enabled');
  perform pg_temp.owner_assert((select array_agg(milestone_days order by milestone_days)=array[30,90,180,365]
    from public.account_trust_owner_milestones),'verified tenure milestones are canonical');
end;
$$;

-- Verified Owner: an unverified/rejected claim is below threshold; one approved,
-- email-verified claim with current ownership is exact. Multiple owned Spots do
-- not duplicate the account-level milestone.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_spot uuid;v_count integer;
begin
  v_below:=pg_temp.owner_make_user('verified-below');
  v_spot:=pg_temp.owner_make_spot('verified-below',null,true);
  perform pg_temp.owner_add_claim(v_below,v_spot,'rejected',v_now-interval '2 days',false);
  v_at:=pg_temp.owner_make_verified('verified-at',v_now-interval '1 day');
  v_above:=pg_temp.owner_make_verified('verified-above',v_now-interval '2 days');
  v_spot:=pg_temp.owner_make_spot('verified-above-2',v_above,true);
  perform pg_temp.owner_add_claim(v_above,v_spot,'approved',v_now-interval '1 day',true);
  perform public.account_trust_evaluate_owner_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_above,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_verified'),'rejected/unverified claim is below verified threshold');
  perform pg_temp.owner_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_verified'),'one valid ownership relationship emits verified once');
  perform pg_temp.owner_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_verified'),'multiple owned Spots never duplicate owner_verified');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='owner';
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform pg_temp.owner_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='owner')=v_count,'verified evaluation is idempotent');
end;
$$;

-- Complete operational profile requires verified ownership, core identity and
-- location fields, plus one contact channel. It never evaluates quality.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;
begin
  v_below:=pg_temp.owner_make_verified('profile-below',v_now-interval '10 days',false);
  v_at:=pg_temp.owner_make_verified('profile-at',v_now-interval '10 days',true);
  perform public.account_trust_evaluate_owner_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_profile_complete'),'missing operational fields stay below completeness');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_profile_complete'
      and evidence->>'field_values_excluded'='true'),'complete operational profile emits without copying field values');
end;
$$;

-- Long-term tenure boundaries: 29d is below; exactly 30d emits only 30d; 365d
-- emits all four milestones exactly once.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_count integer;
begin
  v_below:=pg_temp.owner_make_verified('tenure-below',v_now-interval '29 days');
  v_at:=pg_temp.owner_make_verified('tenure-at',v_now-interval '30 days');
  v_above:=pg_temp.owner_make_verified('tenure-above',v_now-interval '366 days');
  perform public.account_trust_evaluate_owner_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_above,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_long_term_verified'),'29 days is below first milestone');
  perform pg_temp.owner_assert((select count(*)=1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_long_term_verified'
      and (evidence->>'milestone_days')::integer=30),'exactly 30 days emits first milestone');
  perform pg_temp.owner_assert((select count(*)=4 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_long_term_verified'),'366 days emits all four milestones');
  select count(*) into v_count from public.account_trust_signals where user_id=v_above and dimension='owner';
  perform public.account_trust_evaluate_owner_user_v1(v_above,v_now);
  perform pg_temp.owner_assert((select count(*) from public.account_trust_signals
    where user_id=v_above and dimension='owner')=v_count,'tenure milestones never repeat');
end;
$$;

-- Stable information requires both verified tenure and a complete 90-day
-- observation horizon. A normal address/phone/website/email update is ignored.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_spot uuid;
begin
  v_below:=pg_temp.owner_make_verified('stable-below',v_now-interval '200 days');
  v_at:=pg_temp.owner_make_verified('stable-at',v_now-interval '200 days');
  update public.account_trust_owner_evaluation_state set observation_started_at=v_now-interval '89 days' where user_id=v_below;
  update public.account_trust_owner_evaluation_state set observation_started_at=v_now-interval '90 days' where user_id=v_at;
  select id into v_spot from public.spots where owner_id=v_at limit 1;
  update public.spots set address='Neue normale Adresse 2',phone='+41000000000',
    website='https://updated.example.invalid',email='updated@example.invalid' where id=v_spot;
  update public.spots set name='One legitimate rebrand' where id=v_spot;
  perform public.account_trust_evaluate_owner_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_stable_information'),'89 observed days is below threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_stable_information'
      and evidence->>'ordinary_maintenance_excluded'='true'
      and (evidence->>'observed_core_change_count')::integer=1),
    '90 observed days and one legitimate core update remain stable');
  perform pg_temp.owner_assert((select count(*)=1 from public.account_trust_owner_events
    where user_id=v_at and change_kind='business_name'),
    'address, phone, website and email changes create no instability evidence');
end;
$$;

-- Responsiveness: three requests are below the minimum. Four considered
-- requests with three on time meet the 75% boundary; four on time are above.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_user uuid;v_i integer;v_count integer;
begin
  v_below:=pg_temp.owner_make_verified('responsive-below',v_now-interval '100 days');
  v_at:=pg_temp.owner_make_verified('responsive-at',v_now-interval '100 days');
  v_above:=pg_temp.owner_make_verified('responsive-above',v_now-interval '100 days');
  foreach v_user in array array[v_below,v_at,v_above] loop
    for v_i in 1..(case when v_user=v_below then 3 else 4 end) loop
      if v_user=v_at and v_i=4 then
        perform pg_temp.owner_request(v_user,'response-at-'||v_i,v_now-interval '20 days',v_now-interval '19 days','open',null);
      else
        perform pg_temp.owner_request(v_user,'response-'||v_user||'-'||v_i,
          v_now-make_interval(days=>20+v_i),v_now-make_interval(days=>19+v_i),
          'completed',v_now-make_interval(days=>19+v_i,hours=>1));
      end if;
    end loop;
  end loop;
  perform public.account_trust_evaluate_owner_user_v1(v_below,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform public.account_trust_evaluate_owner_user_v1(v_above,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_responsive'),'three requests remain below minimum sample');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_responsive'
      and (evidence->>'on_time_ratio')::numeric=0.75),'three of four meets exact responsiveness ratio');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_responsive'
      and (evidence->>'on_time_ratio')::numeric=1),'four of four remains above threshold');
  select count(*) into v_count from public.account_trust_signals where user_id=v_at and dimension='owner';
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform pg_temp.owner_assert((select count(*) from public.account_trust_signals
    where user_id=v_at and dimension='owner')=v_count,'responsiveness is idempotent');
end;
$$;

-- Repeated invalid claims: one rejection is normal, two are below, three
-- across two Spots are exact, and four remain above.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_user uuid;v_i integer;v_spot uuid;
begin
  v_below:=pg_temp.owner_make_user('claims-below');
  v_at:=pg_temp.owner_make_user('claims-at');
  v_above:=pg_temp.owner_make_user('claims-above');
  foreach v_user in array array[v_below,v_at,v_above] loop
    for v_i in 1..(case when v_user=v_below then 2 when v_user=v_at then 3 else 4 end) loop
      v_spot:=pg_temp.owner_make_spot('claim-'||v_user||'-'||v_i,null,true);
      perform pg_temp.owner_add_claim(v_user,v_spot,case when v_i%2=0 then 'revoked' else 'rejected' end,
        v_now-make_interval(days=>v_i),true);
    end loop;
    perform public.account_trust_evaluate_owner_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_repeated_claim_abuse'),'two invalid claims remain below threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_repeated_claim_abuse'
      and (evidence->>'invalid_claim_count')::integer=3),'three claims across two Spots meet threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_repeated_claim_abuse'
      and (evidence->>'invalid_claim_count')::integer=4),'four invalid claims remain above threshold');
end;
$$;

-- Document issues are confirmed service evidence. One correction is normal;
-- two are below, three exact, four above. Raw documents are never stored.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_user uuid;v_i integer;v_first uuid;v_repeat uuid;
begin
  v_below:=pg_temp.owner_make_user('documents-below');
  v_at:=pg_temp.owner_make_user('documents-at');
  v_above:=pg_temp.owner_make_user('documents-above');
  foreach v_user in array array[v_below,v_at,v_above] loop
    for v_i in 1..(case when v_user=v_below then 2 when v_user=v_at then 3 else 4 end) loop
      v_first:=public.account_trust_record_owner_event_v1(v_user,'document_issue_confirmed',
        'trusted_owner_review_adapter','document-'||v_user||'-'||v_i,v_now-make_interval(days=>v_i),null);
      if v_i=1 then
        v_repeat:=public.account_trust_record_owner_event_v1(v_user,'document_issue_confirmed',
          'trusted_owner_review_adapter','document-'||v_user||'-'||v_i,v_now-make_interval(days=>v_i),null);
        perform pg_temp.owner_assert(v_first=v_repeat,'document event ingestion is idempotent');
      end if;
    end loop;
    perform public.account_trust_evaluate_owner_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_document_quality'),'two document corrections remain below threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_document_quality'
      and evidence->>'documents_excluded'='true'),'three confirmed issues meet threshold without document storage');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_document_quality'),'four confirmed issues remain above threshold');
end;
$$;

-- Data instability requires four core events spanning two change categories.
-- Three events are below, four exact, five above.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_user uuid;v_i integer;v_spot uuid;
begin
  v_below:=pg_temp.owner_make_verified('instability-below',v_now-interval '200 days');
  v_at:=pg_temp.owner_make_verified('instability-at',v_now-interval '200 days');
  v_above:=pg_temp.owner_make_verified('instability-above',v_now-interval '200 days');
  foreach v_user in array array[v_below,v_at,v_above] loop
    select id into v_spot from public.spots where owner_id=v_user limit 1;
    for v_i in 1..(case when v_user=v_below then 3 when v_user=v_at then 4 else 5 end) loop
      if v_i%2=0 then
        update public.spots set name='Changed '||v_i||' '||v_user where id=v_spot;
      else
        insert into public.categories(id,name)
        values(pg_temp.owner_uuid('category:'||v_i||':'||v_user),'Category '||v_i||' '||v_user);
        update public.spots set category_id=pg_temp.owner_uuid('category:'||v_i||':'||v_user) where id=v_spot;
      end if;
    end loop;
    perform public.account_trust_evaluate_owner_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_data_instability'),'three core changes remain below threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_data_instability'
      and (evidence->>'core_change_count')::integer=4
      and (evidence->>'distinct_change_kind_count')::integer=2),'four events across two categories meet threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_data_instability'),'five core changes remain above threshold');
end;
$$;

-- Neglect needs three requests overdue beyond the seven-day grace period.
do $$
declare v_now timestamptz:=now();v_below uuid;v_at uuid;v_above uuid;v_user uuid;v_i integer;
begin
  v_below:=pg_temp.owner_make_user('neglect-below');
  v_at:=pg_temp.owner_make_user('neglect-at');
  v_above:=pg_temp.owner_make_user('neglect-above');
  foreach v_user in array array[v_below,v_at,v_above] loop
    for v_i in 1..(case when v_user=v_below then 2 when v_user=v_at then 3 else 4 end) loop
      perform pg_temp.owner_request(v_user,'neglect-'||v_user||'-'||v_i,
        v_now-interval '30 days',v_now-interval '8 days','open',null);
    end loop;
    perform public.account_trust_evaluate_owner_user_v1(v_user,v_now);
  end loop;
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_below and signal_key='owner_neglect'),'two overdue requests remain below threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_neglect'
      and (evidence->>'overdue_request_count')::integer=3),'three overdue requests meet threshold');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_above and signal_key='owner_neglect'),'four overdue requests remain above threshold');
end;
$$;

-- Correlation: one issue family cannot create owner_trust_pattern. Claim,
-- document and neglect families together meet the exact threshold.
do $$
declare v_now timestamptz:=now();v_single uuid;v_at uuid;v_i integer;v_spot uuid;
begin
  v_single:=pg_temp.owner_make_user('pattern-single');
  for v_i in 1..3 loop
    perform public.account_trust_record_owner_event_v1(v_single,'document_issue_confirmed',
      'trusted_owner_review_adapter','pattern-single-'||v_i,v_now-make_interval(days=>v_i),null);
  end loop;
  perform public.account_trust_evaluate_owner_user_v1(v_single,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_single and signal_key='owner_trust_pattern'),'one risk family cannot create owner pattern');

  v_at:=pg_temp.owner_make_user('pattern-at');
  for v_i in 1..3 loop
    v_spot:=pg_temp.owner_make_spot('pattern-at-'||v_i,null,true);
    perform pg_temp.owner_add_claim(v_at,v_spot,'rejected',v_now-make_interval(days=>v_i),true);
    perform public.account_trust_record_owner_event_v1(v_at,'document_issue_confirmed',
      'trusted_owner_review_adapter','pattern-at-document-'||v_i,v_now-make_interval(days=>v_i),null);
    perform pg_temp.owner_request(v_at,'pattern-at-request-'||v_i,
      v_now-interval '30 days',v_now-interval '8 days','open',null);
  end loop;
  perform public.account_trust_evaluate_owner_user_v1(v_at,v_now);
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_at and signal_key='owner_trust_pattern'
      and (evidence->>'aligned_risk_family_count')::integer=3),'three independent risk families create owner pattern');
end;
$$;

-- TTL: temporary evidence remains auditable after expiry but no longer
-- contributes to the current Account Trust score.
do $$
declare v_now timestamptz:=now();v_user uuid:=pg_temp.owner_make_user('ttl');v_result jsonb;
begin
  v_result:=public.account_trust_emit_signal_v1(v_user,'owner_document_quality',
    'backyrd.owner.document_quality','1.0.0',0.65,0.75,v_now-interval '91 days',null,
    'expired-fixture','{"synthetic":true}'::jsonb,'{}'::jsonb);
  perform public.account_trust_recalculate_v1(v_user,null,'sprint95_expiry_check');
  perform pg_temp.owner_assert(exists(select 1 from public.account_trust_signals
    where user_id=v_user and signal_key='owner_document_quality' and expires_at<=v_now),
    'expired issue remains in historical signal audit');
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_scores
    where user_id=v_user and 'OWNER_DOCUMENT_QUALITY'=any(reason_codes)),
    'expired issue no longer contributes to current trust');
end;
$$;

-- False-positive and no-side-effect matrix: ordinary maintenance, one rejected
-- claim, and one document correction remain neutral. Evaluation changes only
-- Account Trust tables.
do $$
declare v_now timestamptz:=now();v_user uuid;v_spot uuid;v_claim bigint;
  v_claim_status text;v_owner_before uuid;v_ranking integer;v_enforcements integer;
begin
  v_user:=pg_temp.owner_make_verified('false-positive-maintenance',v_now-interval '200 days');
  select id,owner_id into v_spot,v_owner_before from public.spots where owner_id=v_user limit 1;
  update public.spots set address='Moved address',phone='+41111111111',
    website='https://maintenance.example.invalid',email='maintenance@example.invalid',
    header_photo_path='owner-maintenance/image.jpg' where id=v_spot;
  v_claim:=pg_temp.owner_add_claim(v_user,pg_temp.owner_make_spot('false-positive-rejected',null,true),
    'rejected',v_now-interval '1 day',true);
  perform public.account_trust_record_owner_event_v1(v_user,'document_issue_confirmed',
    'trusted_owner_review_adapter','single-document-correction',v_now-interval '1 day',null);
  select status into v_claim_status from public.spot_claims where id=v_claim;
  select count(*) into v_ranking from public.ranking_config;
  select count(*) into v_enforcements from public.safety_account_enforcements;
  perform public.account_trust_evaluate_owner_user_v1(v_user,v_now);
  perform pg_temp.owner_assert(not exists(select 1 from public.account_trust_signals
    where user_id=v_user and signal_key in('owner_repeated_claim_abuse','owner_document_quality',
      'owner_data_instability','owner_neglect','owner_trust_pattern')),
    'ordinary maintenance, one rejection and one correction stay neutral');
  perform pg_temp.owner_assert((select owner_id from public.spots where id=v_spot)=v_owner_before,
    'Owner Trust does not change Spot ownership');
  perform pg_temp.owner_assert((select status from public.spot_claims where id=v_claim)=v_claim_status,
    'Owner Trust does not approve or reject claims');
  perform pg_temp.owner_assert((select count(*) from public.ranking_config)=v_ranking,
    'Owner Trust does not change ranking');
  perform pg_temp.owner_assert((select count(*) from public.safety_account_enforcements)=v_enforcements,
    'Owner Trust creates no enforcement');
end;
$$;

-- Generic Admin contract exposes Owner dimension/signals without a new UI.
do $$
declare v_now timestamptz:=now();v_owner uuid;v_admin uuid;v_detail jsonb;
begin
  v_owner:=pg_temp.owner_make_verified('admin-contract-owner',v_now-interval '100 days');
  perform public.account_trust_evaluate_owner_user_v1(v_owner,v_now);
  v_admin:=pg_temp.owner_make_user('admin-contract-admin');
  update public.profiles set is_admin=true where id=v_admin;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_detail:=public.account_trust_admin_detail_v1(v_owner);
  perform pg_temp.owner_assert((v_detail#>'{score,dimension_scores}') ? 'owner',
    'Admin detail exposes generic Owner dimension');
  perform pg_temp.owner_assert(exists(select 1 from jsonb_array_elements(v_detail->'signals') x
    where x->>'dimension'='owner' and x->>'detector_version'='1.0.0'),
    'Admin detail exposes Owner signal evidence and detector version');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
end;
$$;

-- Least privilege, RLS, explicit search paths, and data minimization.
do $$
declare v_user uuid:=pg_temp.owner_make_user('authorization');
begin
  perform pg_temp.owner_assert(not has_function_privilege('anon',
    'public.account_trust_evaluate_owner_user_v1(uuid,timestamptz)','EXECUTE'),
    'anon cannot execute Owner detector');
  perform pg_temp.owner_assert(not has_function_privilege('authenticated',
    'public.account_trust_evaluate_owner_user_v1(uuid,timestamptz)','EXECUTE'),
    'authenticated cannot execute Owner detector');
  perform pg_temp.owner_assert(not has_function_privilege('authenticated',
    'public.account_trust_record_owner_event_v1(uuid,text,text,text,timestamptz,text)','EXECUTE'),
    'authenticated cannot fabricate Owner evidence');
  perform pg_temp.owner_assert(not has_function_privilege('authenticated',
    'public.account_trust_upsert_owner_request_v1(uuid,text,text,timestamptz,timestamptz,text,timestamptz)','EXECUTE'),
    'authenticated cannot fabricate platform requests');
  perform pg_temp.owner_assert(not has_table_privilege('authenticated',
    'public.account_trust_owner_events','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated',
      'public.account_trust_owner_requests','SELECT,INSERT,UPDATE,DELETE'),
    'authenticated cannot read or mutate private Owner evidence');
  perform pg_temp.owner_assert((select count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in('account_trust_owner_detector_config','account_trust_owner_milestones',
      'account_trust_owner_events','account_trust_owner_requests','account_trust_owner_evaluation_state')
      and c.relrowsecurity),'all Owner private tables enforce RLS');
  perform pg_temp.owner_assert(not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name in('account_trust_owner_events','account_trust_owner_requests')
      and column_name in('document','proof','note','message','email','address','phone','website','raw_reference')),
    'Owner evidence tables contain no raw document, note, contact, or request content');
  perform pg_temp.owner_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'account_trust%owner%v1'
      and p.prosecdef and not coalesce(p.proconfig,'{}'::text[])::text like '%search_path%'),
    'all SECURITY DEFINER Owner functions have explicit search_path');

end;
$$;

select 'Sprint 9.5 Owner Trust acceptance passed' as result;

rollback;
