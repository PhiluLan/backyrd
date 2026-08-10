-- Sprint 9.3: privacy-respecting Network Trust signals.
--
-- Relationships are derived from existing Backyrd product state. This adds no
-- IP, WiFi, fingerprint, advertising identifier, contact, or location tracking
-- and performs no enforcement, ranking, visibility, or distribution change.

create table public.account_trust_network_detector_config (
  detector_key text primary key check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  enabled boolean not null default true,
  signal_strength numeric(5,4) not null check (signal_strength between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_network_evaluation_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  last_signal_count integer not null default 0 check (last_signal_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_trust_network_evaluation_due_idx
  on public.account_trust_network_evaluation_state(next_evaluation_at,user_id);

comment on table public.account_trust_network_detector_config is
  'Versioned conservative Network Trust thresholds. Signals are probabilistic evidence, never proof.';
comment on table public.account_trust_network_evaluation_state is
  'Network Trust scheduling state only; no relationship, content, installation, or personal data is duplicated.';

insert into public.account_trust_signal_registry(
  signal_key,dimension,polarity,base_score_impact,reason_code,
  definition_version,default_ttl,description,metadata
) values
  ('network_shared_installation','network','risk',-4,'NETWORK_SHARED_INSTALLATION',
   1,interval '90 days','Multiple consented accounts used the same pseudonymous Analytics installation.',
   '{"detector_family":"network","signal_interpretation":"weak_indicator_not_proof","privacy_basis":"existing_opt_in_analytics"}'::jsonb),
  ('network_coordinated_review_overlap','network','risk',-12,'NETWORK_COORDINATED_REVIEW_OVERLAP',
   1,interval '30 days','The same account pair repeatedly reviewed several shared Spots in narrow time windows.',
   '{"detector_family":"network","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('network_coordinated_content_similarity','network','risk',-14,'NETWORK_COORDINATED_CONTENT_SIMILARITY',
   1,interval '30 days','Sprint 8 coordinated-copy evidence recurred across multiple Spots for the account.',
   '{"detector_family":"network","signal_interpretation":"indicator_not_proof","evidence_source":"review_integrity_coordinated_copy"}'::jsonb),
  ('network_mutual_engagement_cluster','network','risk',-9,'NETWORK_MUTUAL_ENGAGEMENT_CLUSTER',
   1,interval '30 days','A small group showed dense reciprocal engagement concentrated within the group.',
   '{"detector_family":"network","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('network_coordinated_spot_targeting','network','risk',-12,'NETWORK_COORDINATED_SPOT_TARGETING',
   1,interval '30 days','Related accounts repeatedly targeted the same small Spot set across several days.',
   '{"detector_family":"network","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('network_repeated_account_group','network','risk',-16,'NETWORK_REPEATED_ACCOUNT_GROUP',
   1,interval '60 days','Sprint 8 found substantially the same review group coordinated across Spots.',
   '{"detector_family":"network","signal_interpretation":"indicator_not_proof","evidence_source":"review_integrity_repeated_group_pattern"}'::jsonb),
  ('network_new_account_cluster','network','risk',-18,'NETWORK_NEW_ACCOUNT_CLUSTER',
   1,interval '30 days','Several new accounts aligned across at least two independent relationship dimensions.',
   '{"detector_family":"network","signal_interpretation":"indicator_not_proof","multi_signal_required":true}'::jsonb),
  ('network_engagement_ring','network','risk',-20,'NETWORK_ENGAGEMENT_RING',
   1,interval '60 days','A persistent closed engagement group also aligned with coordinated activity evidence.',
   '{"detector_family":"network","signal_interpretation":"high_confidence_indicator_not_proof","multi_signal_required":true}'::jsonb);

insert into public.account_trust_network_detector_config(
  detector_key,detector_version,signal_strength,confidence,settings
) values
  ('backyrd.network.shared_installation','1.0.0',0.35,0.50,
   '{"minimum_accounts":2,"ttl_days":90,"requires_active_optional_analytics_consent":true}'::jsonb),
  ('backyrd.network.coordinated_review_overlap','1.0.0',0.65,0.75,
   '{"window_days":30,"coordination_window_minutes":30,"minimum_shared_spots":3,"minimum_overlap_windows":3}'::jsonb),
  ('backyrd.network.coordinated_content_similarity','1.0.0',0.70,0.80,
   '{"window_days":30,"minimum_integrity_spots":2,"minimum_integrity_signals":2,"sprint8_signal":"review_integrity_coordinated_copy"}'::jsonb),
  ('backyrd.network.mutual_engagement_cluster','1.0.0',0.55,0.65,
   '{"window_days":30,"minimum_mutual_peers":3,"maximum_mutual_peers":8,"minimum_each_direction":2,"minimum_reciprocal_events":12,"minimum_internal_share":0.80}'::jsonb),
  ('backyrd.network.coordinated_spot_targeting','1.0.0',0.65,0.70,
   '{"window_days":30,"minimum_shared_target_days":3,"maximum_target_spots":2,"minimum_each_direction_engagement":2,"requires_relationship_evidence":true}'::jsonb),
  ('backyrd.network.repeated_account_group','1.0.0',0.75,0.85,
   '{"window_days":60,"minimum_sprint8_signals":1,"sprint8_signal":"review_integrity_repeated_group_pattern"}'::jsonb),
  ('backyrd.network.new_account_cluster','1.0.0',0.80,0.80,
   '{"maximum_account_age_days":7,"minimum_cluster_accounts":3,"minimum_evidence_families":2,"ttl_days":30}'::jsonb),
  ('backyrd.network.engagement_ring','1.0.0',0.90,0.90,
   '{"window_days":60,"minimum_group_accounts":4,"maximum_group_accounts":6,"minimum_reciprocal_events":24,"minimum_activity_span_days":7,"minimum_internal_share":0.85,"requires_coordination_evidence":true}'::jsonb);

create or replace function public.account_trust_network_hash_uuid_v1(p_value uuid)
returns text
language sql
immutable
security definer
set search_path = extensions,pg_catalog
as $$
  select encode(extensions.digest(convert_to(p_value::text,'UTF8'),'sha256'),'hex');
$$;

create or replace function public.account_trust_network_engagement_edges_v1(
  p_from timestamptz,
  p_to timestamptz
) returns table(source_user_id uuid,target_user_id uuid,edge_type text,occurred_at timestamptz)
language sql
stable
security definer
set search_path = public,pg_catalog
as $$
  select l.user_id,r.user_id,'review_like',l.created_at
  from public.review_likes l join public.reviews r on r.id=l.review_id
  where r.user_id is not null and l.user_id<>r.user_id
    and l.created_at between p_from and p_to
  union all
  select c.user_id,r.user_id,'review_comment',c.created_at
  from public.review_comments c join public.reviews r on r.id=c.review_id
  where r.user_id is not null and c.user_id<>r.user_id
    and c.created_at between p_from and p_to
  union all
  select x.user_id,p.user_id,'moment_reaction',x.created_at
  from public.social_post_reactions x join public.social_posts p on p.id=x.post_id
  where x.user_id<>p.user_id and p.status='published'
    and x.created_at between p_from and p_to
  union all
  select c.user_id,p.user_id,'moment_comment',c.created_at
  from public.social_comments c join public.social_posts p on p.id=c.post_id
  where c.user_id<>p.user_id and c.status='published' and p.status='published'
    and c.created_at between p_from and p_to
  union all
  select f.follower,f.following,'follow',f.created_at
  from public.follows f where f.created_at between p_from and p_to;
$$;

create or replace function public.account_trust_evaluate_network_user_v1(
  p_user_id uuid,
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public,auth,extensions,pg_catalog
as $$
declare
  v_created_at timestamptz;
  v_config public.account_trust_network_detector_config%rowtype;
  v_result jsonb;
  v_emitted integer := 0;
  v_shared record;
  v_shared_account_max integer := 0;
  v_overlap_partner uuid;
  v_overlap_spots integer := 0;
  v_overlap_windows integer := 0;
  v_content_spots integer := 0;
  v_content_signals integer := 0;
  v_content_accounts integer := 0;
  v_repeated_signal record;
  v_repeated_count integer := 0;
  v_mutual_peers integer := 0;
  v_reciprocal_events integer := 0;
  v_internal_share numeric := 0;
  v_engagement_span interval := interval '0 seconds';
  v_target_partner uuid;
  v_target_days integer := 0;
  v_target_spots integer := 0;
  v_related_new_accounts integer := 0;
  v_evidence_families integer := 0;
  v_coordination_present boolean := false;
begin
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'network_evaluation_time_invalid' using errcode='22023';
  end if;
  select u.created_at into v_created_at
  from auth.users u where u.id=p_user_id and u.deleted_at is null;
  if v_created_at is null or not exists(select 1 from public.profiles p where p.id=p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode='P0002';
  end if;

  -- Weak installation evidence is consent-gated for every associated account.
  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.shared_installation' and enabled;
  if v_config.detector_key is not null
     and public.user_has_active_consent_v1(p_user_id,'optional_product_analytics') then
    for v_shared in
      select a.technical_identity_hash,count(distinct peer.user_id)::integer account_count
      from public.account_trust_identity_installation_accounts a
      join public.account_trust_identity_installation_accounts peer
        on peer.technical_identity_hash=a.technical_identity_hash
      join auth.users u on u.id=peer.user_id and u.deleted_at is null
      where a.user_id=p_user_id
        and public.user_has_active_consent_v1(peer.user_id,'optional_product_analytics')
      group by a.technical_identity_hash
      having count(distinct peer.user_id)>=(v_config.settings->>'minimum_accounts')::integer
    loop
      v_shared_account_max:=greatest(v_shared_account_max,v_shared.account_count);
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'network_shared_installation',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'installation:'||v_shared.technical_identity_hash,
        jsonb_build_object('technical_identity_hash',v_shared.technical_identity_hash,
          'associated_account_count',v_shared.account_count,'raw_identifier_excluded',true),
        '{"signal_interpretation":"weak_indicator_not_proof","active_consent_required":true}'::jsonb
      );
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end loop;
  end if;

  -- Pair overlap requires the same pair across several Spots; one popular Spot
  -- or one group outing can never satisfy this detector.
  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.coordinated_review_overlap' and enabled;
  if v_config.detector_key is not null then
    select x.partner_id,x.shared_spots,x.overlap_windows
    into v_overlap_partner,v_overlap_spots,v_overlap_windows
    from (
      select peer.user_id partner_id,count(distinct mine.spot_id)::integer shared_spots,
             count(*)::integer overlap_windows
      from public.reviews mine join public.reviews peer
        on peer.spot_id=mine.spot_id and peer.user_id is not null and peer.user_id<>mine.user_id
       and peer.created_at between mine.created_at-make_interval(mins=>(v_config.settings->>'coordination_window_minutes')::integer)
                               and mine.created_at+make_interval(mins=>(v_config.settings->>'coordination_window_minutes')::integer)
      where mine.user_id=p_user_id
        and mine.created_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of
      group by peer.user_id
    ) x
    order by x.shared_spots desc,x.overlap_windows desc,x.partner_id limit 1;
    if v_overlap_partner is not null
       and v_overlap_spots>=(v_config.settings->>'minimum_shared_spots')::integer
       and v_overlap_windows>=(v_config.settings->>'minimum_overlap_windows')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'network_coordinated_review_overlap',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'partner:'||public.account_trust_network_hash_uuid_v1(v_overlap_partner)||':'||to_char(p_as_of,'YYYY-MM'),
        jsonb_build_object('related_account_hash',public.account_trust_network_hash_uuid_v1(v_overlap_partner),
          'shared_spot_count',v_overlap_spots,'overlap_window_count',v_overlap_windows,
          'coordination_window_minutes',(v_config.settings->>'coordination_window_minutes')::integer),
        '{"signal_interpretation":"indicator_not_proof","single_popular_spot_excluded":true}'::jsonb
      );
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  -- Reuse Sprint 8 coordinated-copy conclusions; no review text is copied into
  -- Account Trust and no second similarity engine is introduced.
  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.coordinated_content_similarity' and enabled;
  if v_config.detector_key is not null then
    with integrity_windows as (
      select s.id signal_id,anchor.id review_id,anchor.spot_id,anchor.created_at,
             public.safety_normalize_review_text_v1(anchor.text) normalized_text
      from public.safety_signals s
      join public.safety_cases c on c.id=s.case_id
      join public.safety_content_items ci on ci.id=c.content_item_id
      join public.reviews anchor on anchor.id=ci.entity_id
      where s.provider='backyrd_integrity' and s.flagged
        and s.signal_type='review_integrity_coordinated_copy'
        and s.created_at>=p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer)
        and s.created_at<=p_as_of
    ), memberships as (
      select w.signal_id,w.spot_id,r.user_id
      from integrity_windows w join public.reviews r on r.spot_id=w.spot_id
       and r.created_at between w.created_at-interval '30 minutes' and w.created_at
       and public.safety_normalize_review_text_v1(r.text)=w.normalized_text
      where r.user_id is not null
    )
    select count(distinct m.spot_id)::integer,count(distinct m.signal_id)::integer,
           count(distinct all_m.user_id)::integer
    into v_content_spots,v_content_signals,v_content_accounts
    from memberships m join memberships all_m on all_m.signal_id=m.signal_id
    where m.user_id=p_user_id;
    if v_content_spots>=(v_config.settings->>'minimum_integrity_spots')::integer
       and v_content_signals>=(v_config.settings->>'minimum_integrity_signals')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'network_coordinated_content_similarity',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'content:'||to_char(p_as_of,'YYYY-MM'),
        jsonb_build_object('sprint8_signal_type','review_integrity_coordinated_copy',
          'integrity_signal_count',v_content_signals,'distinct_spot_count',v_content_spots,
          'participating_account_count',v_content_accounts,'review_text_excluded',true),
        '{"signal_interpretation":"indicator_not_proof","sprint8_evidence_reused":true}'::jsonb
      );
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  -- Mutual engagement remains moderate evidence. Closed-ring classification is
  -- a separate multi-signal detector below.
  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.mutual_engagement_cluster' and enabled;
  if v_config.detector_key is not null then
    with edges as (
      select * from public.account_trust_network_engagement_edges_v1(
        p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer),p_as_of)
    ), peer_counts as (
      select peer_id,sum(out_count)::integer out_count,sum(in_count)::integer in_count,
             min(first_at) first_at,max(last_at) last_at
      from (
        select e.target_user_id peer_id,count(*) out_count,0 in_count,min(e.occurred_at) first_at,max(e.occurred_at) last_at
        from edges e where e.source_user_id=p_user_id group by e.target_user_id
        union all
        select e.source_user_id,0,count(*),min(e.occurred_at),max(e.occurred_at)
        from edges e where e.target_user_id=p_user_id group by e.source_user_id
      ) q group by peer_id
    ), mutual as (
      select * from peer_counts
      where out_count>=(v_config.settings->>'minimum_each_direction')::integer
        and in_count>=(v_config.settings->>'minimum_each_direction')::integer
    ), totals as (
      select count(*)::integer peers,coalesce(sum(out_count+in_count),0)::integer events,
             min(first_at) first_at,max(last_at) last_at from mutual
    ), all_events as (
      select count(*)::numeric total,
             count(*) filter(where (e.source_user_id=p_user_id and exists(select 1 from mutual m where m.peer_id=e.target_user_id))
                                or (e.target_user_id=p_user_id and exists(select 1 from mutual m where m.peer_id=e.source_user_id)))::numeric internal
      from edges e where e.source_user_id=p_user_id or e.target_user_id=p_user_id
    )
    select t.peers,t.events,coalesce(a.internal/nullif(a.total,0),0),
           coalesce(t.last_at-t.first_at,interval '0 seconds')
    into v_mutual_peers,v_reciprocal_events,v_internal_share,v_engagement_span
    from totals t cross join all_events a;
    if v_mutual_peers between (v_config.settings->>'minimum_mutual_peers')::integer
                              and (v_config.settings->>'maximum_mutual_peers')::integer
       and v_reciprocal_events>=(v_config.settings->>'minimum_reciprocal_events')::integer
       and v_internal_share>=(v_config.settings->>'minimum_internal_share')::numeric then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'network_mutual_engagement_cluster',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'mutual:'||to_char(p_as_of,'YYYY-MM'),
        jsonb_build_object('mutual_peer_count',v_mutual_peers,'reciprocal_event_count',v_reciprocal_events,
          'internal_engagement_share',round(v_internal_share,4),'content_excluded',true),
        '{"signal_interpretation":"indicator_not_proof","friend_group_possible":true}'::jsonb
      );
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  -- Sprint 8 repeated-group evidence is consumed directly and remains the
  -- source of truth for group review coordination.
  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.repeated_account_group' and enabled;
  if v_config.detector_key is not null then
    for v_repeated_signal in
      select distinct s.id,s.categories,
        coalesce((s.categories->>'current_group_users')::integer,0) current_group_users,
        coalesce((s.categories->>'prior_coordinated_spots')::integer,0) prior_spots
      from public.safety_signals s
      join public.safety_cases c on c.id=s.case_id
      join public.safety_content_items ci on ci.id=c.content_item_id
      join public.reviews anchor on anchor.id=ci.entity_id
      where s.provider='backyrd_integrity' and s.flagged
        and s.signal_type='review_integrity_repeated_group_pattern'
        and s.created_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of
        and exists(select 1 from public.reviews member
          where member.user_id=p_user_id and member.spot_id=anchor.spot_id
            and member.created_at between anchor.created_at-interval '60 minutes' and anchor.created_at)
    loop
      v_repeated_count:=v_repeated_count+1;
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'network_repeated_account_group',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'sprint8:'||v_repeated_signal.id::text,
        jsonb_build_object('sprint8_signal_id',v_repeated_signal.id,'sprint8_signal_type','review_integrity_repeated_group_pattern',
          'current_group_users',v_repeated_signal.current_group_users,
          'prior_coordinated_spots',v_repeated_signal.prior_spots),
        '{"signal_interpretation":"indicator_not_proof","sprint8_evidence_reused":true}'::jsonb
      );
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end loop;
  end if;

  -- Repeated targeting requires a small shared target set over several days
  -- plus an independent relationship (consented installation or reciprocity).
  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.coordinated_spot_targeting' and enabled;
  if v_config.detector_key is not null then
    with actions as (
      select r.user_id,r.spot_id,r.created_at::date action_day from public.reviews r
      where r.user_id is not null and r.created_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of
      union
      select p.user_id,p.spot_id,p.created_at::date from public.social_posts p
      where p.spot_id is not null and p.source_type='manual' and p.status='published'
        and p.created_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of
    ), presence as (select distinct user_id,spot_id,action_day from actions), pairs as (
      select peer.user_id partner_id,count(distinct (mine.spot_id,mine.action_day))::integer shared_days,
             count(distinct mine.spot_id)::integer target_spots
      from presence mine join presence peer on peer.spot_id=mine.spot_id and peer.action_day=mine.action_day
       and peer.user_id<>mine.user_id where mine.user_id=p_user_id group by peer.user_id
    ), eligible as (
      select p.*,
        (exists(select 1 from public.account_trust_identity_installation_accounts a
          join public.account_trust_identity_installation_accounts b on b.technical_identity_hash=a.technical_identity_hash
          where a.user_id=p_user_id and b.user_id=p.partner_id
            and public.user_has_active_consent_v1(a.user_id,'optional_product_analytics')
            and public.user_has_active_consent_v1(b.user_id,'optional_product_analytics'))
         or ((select count(*) from public.account_trust_network_engagement_edges_v1(p_as_of-interval '30 days',p_as_of) e
              where e.source_user_id=p_user_id and e.target_user_id=p.partner_id)>=(v_config.settings->>'minimum_each_direction_engagement')::integer
             and (select count(*) from public.account_trust_network_engagement_edges_v1(p_as_of-interval '30 days',p_as_of) e
              where e.source_user_id=p.partner_id and e.target_user_id=p_user_id)>=(v_config.settings->>'minimum_each_direction_engagement')::integer)) related
      from pairs p
    )
    select partner_id,shared_days,target_spots
    into v_target_partner,v_target_days,v_target_spots
    from eligible where shared_days>=(v_config.settings->>'minimum_shared_target_days')::integer
      and target_spots<=(v_config.settings->>'maximum_target_spots')::integer and related
    order by shared_days desc,target_spots,partner_id limit 1;
    if v_target_partner is not null then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'network_coordinated_spot_targeting',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'targeting:'||public.account_trust_network_hash_uuid_v1(v_target_partner)||':'||to_char(p_as_of,'YYYY-MM'),
        jsonb_build_object('related_account_hash',public.account_trust_network_hash_uuid_v1(v_target_partner),
          'shared_target_days',v_target_days,'target_spot_count',v_target_spots,
          'independent_relationship_required',true),
        '{"signal_interpretation":"indicator_not_proof","single_shared_spot_visit_excluded":true}'::jsonb
      );
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  v_coordination_present:=v_overlap_spots>=3 or v_content_spots>=2 or v_repeated_count>0 or v_target_partner is not null;
  v_evidence_families:=(case when v_shared_account_max>=2 then 1 else 0 end)
    +(case when v_overlap_spots>=2 then 1 else 0 end)
    +(case when v_content_spots>=1 then 1 else 0 end)
    +(case when v_repeated_count>0 then 1 else 0 end)
    +(case when v_target_partner is not null then 1 else 0 end);
  -- Count new related accounts without storing a persistent relationship graph.
  with related(user_id) as (
    select p_user_id
    union select b.user_id from public.account_trust_identity_installation_accounts a
      join public.account_trust_identity_installation_accounts b on b.technical_identity_hash=a.technical_identity_hash
      where a.user_id=p_user_id
        and public.user_has_active_consent_v1(a.user_id,'optional_product_analytics')
        and public.user_has_active_consent_v1(b.user_id,'optional_product_analytics')
    union select v_overlap_partner where v_overlap_partner is not null
    union select v_target_partner where v_target_partner is not null
    union select member.user_id from public.safety_signals s
      join public.safety_cases c on c.id=s.case_id join public.safety_content_items ci on ci.id=c.content_item_id
      join public.reviews anchor on anchor.id=ci.entity_id join public.reviews member on member.spot_id=anchor.spot_id
       and member.created_at between anchor.created_at-interval '60 minutes' and anchor.created_at
       and (s.signal_type='review_integrity_repeated_group_pattern'
         or public.safety_normalize_review_text_v1(member.text)=public.safety_normalize_review_text_v1(anchor.text))
      where s.provider='backyrd_integrity' and s.flagged
        and s.signal_type in('review_integrity_coordinated_copy','review_integrity_repeated_group_pattern')
        and s.created_at between p_as_of-interval '30 days' and p_as_of
        and exists(select 1 from public.reviews mine
          where mine.user_id=p_user_id and mine.spot_id=anchor.spot_id
            and mine.created_at between anchor.created_at-interval '60 minutes' and anchor.created_at
            and (s.signal_type='review_integrity_repeated_group_pattern'
              or public.safety_normalize_review_text_v1(mine.text)=public.safety_normalize_review_text_v1(anchor.text)))
  )
  select count(distinct r.user_id)::integer into v_related_new_accounts
  from related r join auth.users u on u.id=r.user_id and u.deleted_at is null
  where u.created_at>=p_as_of-interval '7 days';

  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.new_account_cluster' and enabled;
  if v_config.detector_key is not null
     and p_as_of<=v_created_at+make_interval(days=>(v_config.settings->>'maximum_account_age_days')::integer)
     and v_related_new_accounts>=(v_config.settings->>'minimum_cluster_accounts')::integer
     and v_evidence_families>=(v_config.settings->>'minimum_evidence_families')::integer then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'network_new_account_cluster',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,p_as_of,null,'new_cluster:'||to_char(p_as_of,'YYYY-MM-DD'),
      jsonb_build_object('new_related_account_count',v_related_new_accounts,
        'aligned_evidence_family_count',v_evidence_families,'maximum_account_age_days',
        (v_config.settings->>'maximum_account_age_days')::integer),
      '{"signal_interpretation":"indicator_not_proof","multi_signal_required":true}'::jsonb
    );
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_network_detector_config
  where detector_key='backyrd.network.engagement_ring' and enabled;
  if v_config.detector_key is not null
     and v_mutual_peers+1 between (v_config.settings->>'minimum_group_accounts')::integer
                              and (v_config.settings->>'maximum_group_accounts')::integer
     and v_reciprocal_events>=(v_config.settings->>'minimum_reciprocal_events')::integer
     and v_internal_share>=(v_config.settings->>'minimum_internal_share')::numeric
     and v_engagement_span>=make_interval(days=>(v_config.settings->>'minimum_activity_span_days')::integer)
     and v_coordination_present then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'network_engagement_ring',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,p_as_of,null,'ring:'||to_char(p_as_of,'YYYY-MM'),
      jsonb_build_object('group_account_count',v_mutual_peers+1,'reciprocal_event_count',v_reciprocal_events,
        'internal_engagement_share',round(v_internal_share,4),
        'activity_span_days',floor(extract(epoch from v_engagement_span)/86400),
        'coordination_evidence_present',true),
      '{"signal_interpretation":"high_confidence_indicator_not_proof","multi_signal_required":true}'::jsonb
    );
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  return jsonb_build_object('user_id',p_user_id,'signals_emitted',v_emitted,
    'shared_installation_accounts',v_shared_account_max,'review_overlap_spots',v_overlap_spots,
    'content_similarity_spots',v_content_spots,'mutual_engagement_peers',v_mutual_peers,
    'repeated_group_signals',v_repeated_count,'aligned_evidence_families',v_evidence_families);
end;
$$;

create or replace function public.account_trust_evaluate_network_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public,pg_catalog
as $$
declare v_state record;v_result jsonb;v_processed integer:=0;v_emitted integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then
    raise exception 'network_evaluation_limit_invalid' using errcode='22023';
  end if;
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'network_evaluation_time_invalid' using errcode='22023';
  end if;
  for v_state in select s.user_id from public.account_trust_network_evaluation_state s
    where s.next_evaluation_at<=p_as_of order by s.next_evaluation_at,s.user_id
    limit p_limit for update skip locked
  loop
    v_result:=public.account_trust_evaluate_network_user_v1(v_state.user_id,p_as_of);
    update public.account_trust_network_evaluation_state set last_evaluated_at=p_as_of,
      next_evaluation_at=p_as_of+interval '1 day',
      last_signal_count=coalesce((v_result->>'signals_emitted')::integer,0),updated_at=now()
    where user_id=v_state.user_id;
    v_processed:=v_processed+1;
    v_emitted:=v_emitted+coalesce((v_result->>'signals_emitted')::integer,0);
  end loop;
  return jsonb_build_object('processed',v_processed,'signals_emitted',v_emitted);
end;
$$;

create or replace function public.account_trust_schedule_network_profile_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  insert into public.account_trust_network_evaluation_state(user_id,next_evaluation_at)
  values(new.id,now()) on conflict(user_id) do nothing;
  return new;
end;
$$;

insert into public.account_trust_network_evaluation_state(user_id,next_evaluation_at)
select id,now() from public.profiles on conflict(user_id) do nothing;

create trigger trg_account_trust_schedule_network_profile_v1
after insert on public.profiles for each row execute function public.account_trust_schedule_network_profile_v1();

select public.account_trust_evaluate_network_due_v1(10000,now());

alter table public.account_trust_network_detector_config enable row level security;
alter table public.account_trust_network_evaluation_state enable row level security;
revoke all on table public.account_trust_network_detector_config from public,anon,authenticated;
revoke all on table public.account_trust_network_evaluation_state from public,anon,authenticated;
grant select,insert,update,delete on table public.account_trust_network_detector_config to service_role;
grant select,insert,update,delete on table public.account_trust_network_evaluation_state to service_role;

revoke all on function public.account_trust_network_hash_uuid_v1(uuid) from public,anon,authenticated;
revoke all on function public.account_trust_network_engagement_edges_v1(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_network_user_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_network_due_v1(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_schedule_network_profile_v1() from public,anon,authenticated;
grant execute on function public.account_trust_network_hash_uuid_v1(uuid) to service_role;
grant execute on function public.account_trust_network_engagement_edges_v1(timestamptz,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_network_user_v1(uuid,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_network_due_v1(integer,timestamptz) to service_role;

comment on function public.account_trust_evaluate_network_user_v1(uuid,timestamptz) is
  'Sprint 9.3 service-only derivation of non-enforcing Network Trust signals from existing relationships and Sprint 8 evidence.';
