-- Sprint 10.1-10.4: canonical Distribution policy and product consumption.
--
-- Distribution remains a reversible visibility-confidence decision. It does
-- not mutate source content, Safety, Review Trust, Account Trust, moderation,
-- enforcement, ranking scores, Owner permissions, or recommendation models.

create table public.distribution_trust_policy_rules (
  engine_version text not null
    references public.distribution_trust_engine_versions(version) on delete cascade,
  rule_key text not null check (rule_key ~ '^[a-z][a-z0-9_.-]*$'),
  priority integer not null check (priority between 0 and 1000),
  resulting_state text not null
    check (resulting_state in ('normal','reduced','quarantined','excluded')),
  reason_codes text[] not null check (cardinality(reason_codes) > 0),
  required_context jsonb not null
    check (jsonb_typeof(required_context) = 'object'),
  enabled boolean not null default true,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (engine_version, rule_key)
);

create index distribution_trust_policy_rules_match_idx
  on public.distribution_trust_policy_rules(engine_version, enabled, priority desc);

comment on table public.distribution_trust_policy_rules is
  'Versioned deterministic Distribution policy. Rules match complete Trust context combinations; consumers never implement policy.';

update public.distribution_trust_engine_versions
set status = 'retired', retired_at = now()
where status = 'active';

insert into public.distribution_trust_engine_versions(
  version,status,rules,description,activated_at
) values (
  'distribution-trust-v2','active',
  '{
    "states":["normal","reduced","quarantined","excluded"],
    "precedence":{"normal":0,"reduced":1,"quarantined":2,"excluded":3},
    "policy_contract":"distribution_trust_policy_rules",
    "combination_required_for_automatic_risk":true,
    "pending_human_review":"quarantined",
    "human_outcome_precedence":true,
    "human_override_precedence":true,
    "automatic_restoration":true,
    "consumer_contract":"distribution_trust_filter_entities_v1"
  }'::jsonb,
  'Sprint 10 policy and consumer contract. Trust context is evaluated centrally before product ranking.',
  now()
);

insert into public.distribution_trust_reason_registry(
  reason_code,reason_kind,recommended_state,source_contract,description,metadata
) values
  ('DISTRIBUTION_POLICY_PENDING_HUMAN','trust_input','quarantined','distribution_trust_policy_v2',
   'A canonical case is awaiting accountable human review. Quarantine is temporary and is not removal.',
   '{"temporary":true,"reversible":true,"not_enforcement":true}'::jsonb),
  ('DISTRIBUTION_COMBINED_TRUST_CONCERN','trust_input','reduced','distribution_trust_policy_v2',
   'Independent Review and Account Trust concerns align. Distribution is reduced while the context remains current.',
   '{"combination_required":true,"signal_not_proof":true}'::jsonb),
  ('DISTRIBUTION_COMBINED_HIGH_RISK','trust_input','quarantined','distribution_trust_policy_v2',
   'Multiple independent high-confidence Trust dimensions align and require human review.',
   '{"combination_required":true,"temporary":true,"not_enforcement":true}'::jsonb),
  ('DISTRIBUTION_HUMAN_ALLOW','human_outcome','normal','safety_decision_events',
   'An accountable human decision cleared the content for normal automatic distribution.',
   '{"human_confirmed":true,"reversible":true}'::jsonb)
on conflict (reason_code) do update set
  reason_kind = excluded.reason_kind,
  recommended_state = excluded.recommended_state,
  source_contract = excluded.source_contract,
  description = excluded.description,
  metadata = excluded.metadata,
  enabled = true,
  updated_at = now();

update public.distribution_trust_reason_registry
set recommended_state = 'quarantined',
    description = 'The content awaits accountable human review. Quarantine is temporary and distinct from moderation.',
    metadata = metadata || '{"temporary":true,"not_enforcement":true}'::jsonb,
    updated_at = now()
where reason_code = 'DISTRIBUTION_SAFETY_REVIEW_PENDING';

insert into public.distribution_trust_policy_rules(
  engine_version,rule_key,priority,resulting_state,reason_codes,required_context,description
) values
  ('distribution-trust-v2','pending_human_review',1000,'quarantined',
   array['DISTRIBUTION_POLICY_PENDING_HUMAN'],
   '{"pending_human_review":true}'::jsonb,
   'An unresolved human-review requirement quarantines distribution until resolution.'),
  ('distribution-trust-v2','human_remove',1000,'excluded',
   array['DISTRIBUTION_HUMAN_REMOVE'],
   '{"human_action":"remove"}'::jsonb,
   'A confirmed human remove decision excludes distribution without deleting source data.'),
  ('distribution-trust-v2','human_block_submit',1000,'excluded',
   array['DISTRIBUTION_HUMAN_REMOVE'],
   '{"human_action":"block_submit"}'::jsonb,
   'A confirmed human block-submit outcome excludes distribution.'),
  ('distribution-trust-v2','human_temporary_hide',900,'quarantined',
   array['DISTRIBUTION_HUMAN_TEMPORARY_HIDE'],
   '{"human_action":"temporary_hide"}'::jsonb,
   'A confirmed temporary-hide outcome quarantines distribution.'),
  ('distribution-trust-v2','human_escalate',900,'quarantined',
   array['DISTRIBUTION_HUMAN_TEMPORARY_HIDE'],
   '{"human_action":"escalate"}'::jsonb,
   'A human escalation keeps distribution quarantined pending resolution.'),
  ('distribution-trust-v2','human_limit',850,'reduced',
   array['DISTRIBUTION_HUMAN_LIMIT'],
   '{"human_action":"limit"}'::jsonb,
   'A confirmed human limit outcome reduces distribution.'),
  ('distribution-trust-v2','appeal_allow',820,'normal',
   array['DISTRIBUTION_APPEAL_RESTORED'],
   '{"human_action":"allow","human_source":"appeal_human"}'::jsonb,
   'A successful appeal restores normal automatic distribution.'),
  ('distribution-trust-v2','human_allow',810,'normal',
   array['DISTRIBUTION_HUMAN_ALLOW'],
   '{"human_action":"allow"}'::jsonb,
   'A confirmed human allow outcome restores normal automatic distribution.'),
  ('distribution-trust-v2','human_allow_log',810,'normal',
   array['DISTRIBUTION_HUMAN_ALLOW'],
   '{"human_action":"allow_log"}'::jsonb,
   'A confirmed human allow-and-log outcome restores normal automatic distribution.'),
  ('distribution-trust-v2','integrity_high_account_high',700,'quarantined',
   array['DISTRIBUTION_COMBINED_HIGH_RISK','DISTRIBUTION_REVIEW_INTEGRITY_HIGH_RISK','DISTRIBUTION_ACCOUNT_HIGH_RISK'],
   '{"integrity_risk":"high_risk","account_risk":"high_risk"}'::jsonb,
   'Independent high-risk Review and Account Trust dimensions align.'),
  ('distribution-trust-v2','integrity_high_account_suspicious',680,'quarantined',
   array['DISTRIBUTION_COMBINED_HIGH_RISK','DISTRIBUTION_REVIEW_INTEGRITY_HIGH_RISK','DISTRIBUTION_ACCOUNT_SUSPICIOUS'],
   '{"integrity_risk":"high_risk","account_risk":"suspicious"}'::jsonb,
   'High-risk Review Trust aligns with suspicious Account Trust.'),
  ('distribution-trust-v2','integrity_suspicious_account_high',600,'reduced',
   array['DISTRIBUTION_COMBINED_TRUST_CONCERN','DISTRIBUTION_REVIEW_INTEGRITY_SUSPICIOUS','DISTRIBUTION_ACCOUNT_HIGH_RISK'],
   '{"integrity_risk":"suspicious","account_risk":"high_risk"}'::jsonb,
   'Suspicious Review Trust aligns with high-risk Account Trust.'),
  ('distribution-trust-v2','integrity_suspicious_account_suspicious',580,'reduced',
   array['DISTRIBUTION_COMBINED_TRUST_CONCERN','DISTRIBUTION_REVIEW_INTEGRITY_SUSPICIOUS','DISTRIBUTION_ACCOUNT_SUSPICIOUS'],
   '{"integrity_risk":"suspicious","account_risk":"suspicious"}'::jsonb,
   'Independent suspicious Review and Account Trust dimensions align.'),
  ('distribution-trust-v2','default_normal',0,'normal',
   array['DISTRIBUTION_DEFAULT_NORMAL'],'{}'::jsonb,
   'No current policy combination recommends reduced distribution.');

create or replace function public.distribution_trust_policy_evaluate_v1(
  p_context jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_engine text;
  v_rule public.distribution_trust_policy_rules%rowtype;
begin
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    raise exception 'distribution_policy_context_invalid' using errcode = '22023';
  end if;

  select version into v_engine
  from public.distribution_trust_engine_versions
  where status = 'active';

  select * into v_rule
  from public.distribution_trust_policy_rules r
  where r.engine_version = v_engine
    and r.enabled
    and p_context @> r.required_context
  order by r.priority desc,
    public.distribution_trust_state_rank_v1(r.resulting_state) desc,
    r.rule_key
  limit 1;

  if v_rule.rule_key is null then
    raise exception 'distribution_policy_default_rule_missing';
  end if;

  return jsonb_build_object(
    'engine_version',v_engine,
    'rule_key',v_rule.rule_key,
    'state',v_rule.resulting_state,
    'reason_codes',to_jsonb(v_rule.reason_codes),
    'context',p_context
  );
end;
$$;

create or replace function public.distribution_trust_evaluate_content_v1(
  p_content_item_id uuid,
  p_as_of timestamptz default now(),
  p_transition_source text default 'automatic'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item public.safety_content_items%rowtype;
  v_engine public.distribution_trust_engine_versions%rowtype;
  v_current public.distribution_trust_states%rowtype;
  v_override public.distribution_trust_overrides%rowtype;
  v_account_risk text;
  v_integrity_risk text;
  v_pending_human boolean := false;
  v_human_action text;
  v_human_source text;
  v_context jsonb;
  v_policy jsonb;
  v_automatic text;
  v_effective text;
  v_auto_reasons text[];
  v_reasons text[];
  v_snapshot jsonb;
  v_changed boolean := false;
  v_version bigint := 1;
  v_event_type text;
  v_source text := 'automatic';
  v_transition text;
begin
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'distribution_evaluation_time_invalid' using errcode = '22023';
  end if;
  if p_transition_source not in ('automatic','manual_override','manual_release','override_expiry','initialization') then
    raise exception 'distribution_transition_source_invalid' using errcode = '22023';
  end if;

  select * into v_item from public.safety_content_items where id = p_content_item_id;
  if v_item.id is null then
    raise exception 'distribution_content_item_not_found' using errcode = 'P0002';
  end if;
  select * into v_engine from public.distribution_trust_engine_versions where status = 'active';
  if v_engine.version is null then raise exception 'distribution_active_engine_not_found'; end if;

  select * into v_override
  from public.distribution_trust_overrides
  where content_item_id = p_content_item_id and status = 'active'
  for update;

  if v_override.id is not null and v_override.expires_at is not null
     and v_override.expires_at <= p_as_of then
    update public.distribution_trust_overrides
    set status='expired',released_at=p_as_of,release_reason='override_expired',updated_at=now()
    where id=v_override.id;
    insert into public.distribution_trust_events(
      content_item_id,event_type,source,reason_codes,engine_version,override_id,idempotency_key,metadata
    ) values (
      p_content_item_id,'override_expired','system',array['DISTRIBUTION_ADMIN_RETURN_AUTOMATIC'],
      v_engine.version,v_override.id,'override_expired:'||v_override.id,
      jsonb_build_object('expired_at',v_override.expires_at)
    ) on conflict do nothing;
    v_override.id := null;
    p_transition_source := 'override_expiry';
  end if;

  select s.risk_level into v_account_risk
  from public.account_trust_scores s where s.user_id = v_item.actor_user_id;

  select case
    when bool_or(s.categories->>'risk_level'='high_risk') then 'high_risk'
    when bool_or(s.categories->>'risk_level'='suspicious') then 'suspicious'
    else null end
  into v_integrity_risk
  from public.safety_signals s
  join public.safety_cases c on c.id=s.case_id
  where c.content_item_id=p_content_item_id
    and s.provider='backyrd_integrity'
    and s.flagged is true
    and c.case_status in ('queued','evaluating','needs_review','appealed');

  select exists(
    select 1 from public.safety_cases c
    where c.content_item_id=p_content_item_id
      and c.case_status in ('needs_review','appealed')
  ) into v_pending_human;

  -- The case is the current accountable outcome; decision events are immutable
  -- history. Reading the latest event is unsafe because several human events can
  -- share a transaction timestamp and an appeal updates the case in place.
  select c.final_action,c.decision_source into v_human_action,v_human_source
  from public.safety_cases c
  where c.content_item_id=p_content_item_id
    and c.case_status='decided'
    and c.decision_source in ('human','human_admin','appeal_human')
    and c.final_action in ('allow','allow_log','limit','temporary_hide','escalate','remove','block_submit')
  order by case c.final_action
      when 'remove' then 60 when 'block_submit' then 60
      when 'temporary_hide' then 50 when 'escalate' then 50
      when 'limit' then 40 when 'allow_log' then 20 when 'allow' then 10
      else 0 end desc,
    (c.decision_source='appeal_human') desc,
    c.decided_at desc nulls last,
    c.id
  limit 1;

  v_context := jsonb_strip_nulls(jsonb_build_object(
    'account_risk',v_account_risk,
    'integrity_risk',v_integrity_risk,
    'pending_human_review',v_pending_human,
    'human_action',v_human_action,
    'human_source',v_human_source
  ));
  v_policy := public.distribution_trust_policy_evaluate_v1(v_context);
  v_automatic := v_policy->>'state';
  select coalesce(array_agg(value),array[]::text[]) into v_auto_reasons
  from jsonb_array_elements_text(v_policy->'reason_codes');

  if v_override.id is not null then
    v_effective := v_override.forced_state;
    v_reasons := array_prepend(v_override.reason_code,v_auto_reasons);
  else
    v_effective := v_automatic;
    v_reasons := v_auto_reasons;
  end if;

  v_source := case
    when p_transition_source in ('manual_override','manual_release') then 'admin'
    when p_transition_source='override_expiry' then 'system'
    else 'automatic' end;
  v_snapshot := jsonb_build_object(
    'content_item_id',p_content_item_id,
    'entity_type',v_item.entity_type,
    'actor_user_id',v_item.actor_user_id,
    'policy_rule',v_policy->>'rule_key',
    'policy_context',v_context,
    'override_id',v_override.id
  );

  select * into v_current
  from public.distribution_trust_states
  where content_item_id=p_content_item_id
  for update;

  if v_current.content_item_id is null then
    insert into public.distribution_trust_states(
      content_item_id,engine_version,automatic_state,effective_state,reason_codes,
      automatic_reason_codes,active_override_id,evaluation_source,input_snapshot,evaluated_at
    ) values (
      p_content_item_id,v_engine.version,v_automatic,v_effective,v_reasons,v_auto_reasons,
      v_override.id,case when v_override.id is null then 'automatic' else 'manual_override' end,
      v_snapshot,p_as_of
    );
    v_changed:=true; v_transition:='initialization'; v_event_type:='initialized'; v_version:=1;
  else
    v_changed := v_current.engine_version is distinct from v_engine.version
      or v_current.automatic_state is distinct from v_automatic
      or v_current.effective_state is distinct from v_effective
      or v_current.reason_codes is distinct from v_reasons
      or v_current.active_override_id is distinct from v_override.id;
    v_version := v_current.state_version + case when v_changed then 1 else 0 end;
    update public.distribution_trust_states
    set engine_version=v_engine.version,automatic_state=v_automatic,effective_state=v_effective,
      reason_codes=v_reasons,automatic_reason_codes=v_auto_reasons,active_override_id=v_override.id,
      evaluation_source=case when v_override.id is null then 'automatic' else 'manual_override' end,
      input_snapshot=v_snapshot,state_version=v_version,evaluated_at=p_as_of,updated_at=now()
    where content_item_id=p_content_item_id;
    if v_changed then
      v_transition:=p_transition_source;
      v_event_type:=case
        when v_override.id is null
          and public.distribution_trust_state_rank_v1(v_effective)
            < public.distribution_trust_state_rank_v1(v_current.effective_state)
          then 'automatically_restored'
        else 'state_changed' end;
    end if;
  end if;

  if v_changed then
    insert into public.distribution_trust_history(
      content_item_id,engine_version,previous_automatic_state,automatic_state,
      previous_effective_state,effective_state,transition_source,reason_codes,
      automatic_reason_codes,override_id,input_snapshot,state_version
    ) values (
      p_content_item_id,v_engine.version,v_current.automatic_state,v_automatic,
      v_current.effective_state,v_effective,coalesce(v_transition,'initialization'),v_reasons,
      v_auto_reasons,v_override.id,v_snapshot,v_version
    );
    insert into public.distribution_trust_events(
      content_item_id,event_type,source,previous_state,new_state,reason_codes,
      engine_version,override_id,idempotency_key,metadata
    ) values (
      p_content_item_id,v_event_type,v_source,v_current.effective_state,v_effective,
      case when v_event_type='automatically_restored'
        and not ('DISTRIBUTION_APPEAL_RESTORED'=any(v_reasons))
        then array_append(v_reasons,'DISTRIBUTION_TRUST_RECOVERED') else v_reasons end,
      v_engine.version,v_override.id,'state:'||v_version,
      jsonb_build_object('automatic_state',v_automatic,'transition_source',coalesce(v_transition,'initialization'),
        'policy_rule',v_policy->>'rule_key')
    ) on conflict do nothing;
  end if;

  return jsonb_build_object(
    'content_item_id',p_content_item_id,'engine_version',v_engine.version,
    'policy_rule',v_policy->>'rule_key','automatic_state',v_automatic,
    'effective_state',v_effective,'reason_codes',to_jsonb(v_reasons),
    'override_id',v_override.id,'changed',v_changed,'state_version',v_version
  );
end;
$$;

create or replace function public.distribution_trust_filter_entities_v1(
  p_entity_type text,
  p_entity_ids uuid[],
  p_surface text default 'discovery'
) returns table(entity_id uuid, eligible boolean, distribution_priority integer)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_entity_type not in ('spot','review','social_post','moment','profile') then
    raise exception 'distribution_entity_type_invalid' using errcode='22023';
  end if;
  if p_surface not in ('decision','search','discovery','feed','maps','owner','admin','internal') then
    raise exception 'distribution_surface_invalid' using errcode='22023';
  end if;

  return query
  with requested as (
    select distinct id
    from unnest(coalesce(p_entity_ids,array[]::uuid[])) id
    where id is not null
  ), resolved as (
    select r.id,
      coalesce(s.effective_state,'normal') as effective_state
    from requested r
    left join public.safety_content_items i
      on i.entity_type = case when p_entity_type='moment' then 'social_post' else p_entity_type end
     and i.entity_id = r.id
    left join public.distribution_trust_states s on s.content_item_id=i.id
  )
  select r.id,
    case
      when p_surface in ('owner','admin','internal') then true
      else r.effective_state in ('normal','reduced')
    end,
    case r.effective_state
      when 'normal' then 100
      when 'reduced' then 50
      when 'quarantined' then 10
      else 0
    end
  from resolved r;
end;
$$;

comment on function public.distribution_trust_filter_entities_v1(text,uuid[],text) is
  'Canonical consumer boundary. It exposes eligibility and relative Distribution priority, never private Trust evidence or policy reasons.';

create or replace function public.distribution_trust_entity_is_eligible_v1(
  p_entity_type text,p_entity_id uuid,p_surface text
) returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((
    select eligible from public.distribution_trust_filter_entities_v1(
      p_entity_type,array[p_entity_id],p_surface
    ) limit 1
  ),false);
$$;

create or replace function public.distribution_trust_entity_priority_v1(
  p_entity_type text,p_entity_id uuid,p_surface text
) returns integer
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((
    select distribution_priority from public.distribution_trust_filter_entities_v1(
      p_entity_type,array[p_entity_id],p_surface
    ) limit 1
  ),0);
$$;

create or replace function public.distribution_trust_sync_spot_registry_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_content uuid;
begin
  if tg_op='DELETE' then
    update public.safety_content_items
    set lifecycle_status='removed',updated_at=now()
    where entity_type='spot' and entity_id=old.id;
    return old;
  end if;

  v_content := public.safety_upsert_registry_item_v2(
    'spot','spot',new.id,coalesce(new.owner_id,new.created_by),new.id,new.name,
    case when nullif(btrim(coalesce(new.header_photo_path,'')),'') is null
      then array[]::text[] else array[new.header_photo_path] end,
    'de-CH',jsonb_build_object('source','spots','status',new.status::text),
    case when new.status='approved' then 'live' else 'limited' end
  );
  perform public.distribution_trust_evaluate_content_v1(v_content,now(),'automatic');
  return new;
end;
$$;

create trigger trg_distribution_trust_spot_registry_v1
after insert or update of name,status,owner_id,created_by,header_photo_path or delete
on public.spots for each row
execute function public.distribution_trust_sync_spot_registry_v1();

-- Set-based and restart-safe historical Spot registration. Evaluation is
-- queued by the canonical content trigger and processed below in bounded work.
insert into public.safety_content_items(
  content_type,entity_type,entity_id,actor_user_id,spot_id,text_content,
  image_urls,locale,context,lifecycle_status
)
select 'spot','spot',s.id,coalesce(s.owner_id,s.created_by),s.id,s.name,
  case when nullif(btrim(coalesce(s.header_photo_path,'')),'') is null
    then array[]::text[] else array[s.header_photo_path] end,
  'de-CH',jsonb_build_object('source','spots','status',s.status::text),
  case when s.status='approved' then 'live' else 'limited' end
from public.spots s
on conflict on constraint safety_content_items_unique_entity_v2 do update set
  actor_user_id=coalesce(excluded.actor_user_id,public.safety_content_items.actor_user_id),
  spot_id=excluded.spot_id,
  text_content=excluded.text_content,
  image_urls=excluded.image_urls,
  context=coalesce(public.safety_content_items.context,'{}'::jsonb)||excluded.context,
  lifecycle_status=case
    when public.safety_content_items.lifecycle_status in ('hidden','removed')
      then public.safety_content_items.lifecycle_status
    else excluded.lifecycle_status end,
  updated_at=now();

-- Decision: Distribution eligibility is applied before recommendation ranking.
-- Reduced candidates retain their quality score but sort behind normal ones.
create or replace function public.backyrd_get_decision_spots_v11(
  p_city text default null,p_selected_cluster_ids integer[] default null,p_query text default null,
  p_limit integer default 10,p_k numeric default 1.0,p_open_bonus numeric default 0.0,
  p_taste_weight numeric default 0.28,p_explore_weight numeric default 0.05
) returns table(
  spot_id uuid,name text,city text,is_open_now boolean,final_score numeric,
  matched_tokens text[],matched_counts integer[],matched_terms text[],why_this text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with candidates as materialized (
    select * from public.backyrd_get_decision_debug_v11(
      p_city,p_selected_cluster_ids,p_query,
      greatest(20,least(coalesce(p_limit,10)*5,100)),p_k,p_open_bonus,p_taste_weight,p_explore_weight
    )
  ), eligibility as (
    select e.* from public.distribution_trust_filter_entities_v1(
      'spot',coalesce((select array_agg(c.spot_id) from candidates c),array[]::uuid[]),'decision'
    ) e
  )
  select c.spot_id,c.name,c.city,c.is_open_now,c.final_score,c.matched_tokens,
    c.matched_counts,c.matched_terms,c.why_this
  from candidates c join eligibility e on e.entity_id=c.spot_id
  where e.eligible
  order by e.distribution_priority desc,c.final_score desc
  limit greatest(1,least(coalesce(p_limit,10),20));
$$;

create or replace function public.backyrd_web_city_spots_v1(
  p_city text,p_limit integer default 12
) returns table(
  spot_id uuid,name text,city text,category_name text,photo_url text,
  top_moods text[],review_count bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with review_stats as (
    select r.spot_id,count(*)::bigint review_count from public.reviews r group by r.spot_id
  ), mood_rows as (
    select r.spot_id,nullif(btrim(r.mood_a),'') mood from public.reviews r
    union all select r.spot_id,nullif(btrim(r.mood_b),'') from public.reviews r
  ), mood_counts as (
    select spot_id,mood,count(*) mood_count from mood_rows where mood is not null group by spot_id,mood
  ), top_moods as (
    select spot_id,array_agg(mood order by mood_count desc,mood) filter(where rn<=3) moods
    from (select *,row_number() over(partition by spot_id order by mood_count desc,mood) rn from mood_counts) x
    group by spot_id
  ), candidates as materialized (
    select s.id,s.name,s.city,c.name category_name,
      coalesce(nullif(s.header_photo_path,''),photo.url) photo_url,
      coalesce(tm.moods,array[]::text[]) top_moods,
      coalesce(rs.review_count,0)::bigint review_count
    from public.spots s
    left join public.categories c on c.id=s.category_id
    left join review_stats rs on rs.spot_id=s.id
    left join top_moods tm on tm.spot_id=s.id
    left join lateral (
      select sp.url from public.spot_photos sp
      where sp.spot_id=s.id and nullif(sp.url,'') is not null
      order by sp.created_at nulls last limit 1
    ) photo on true
    where lower(btrim(coalesce(s.city,'')))=lower(btrim(p_city)) and s.status='approved'
  ), eligibility as (
    select e.* from public.distribution_trust_filter_entities_v1(
      'spot',coalesce((select array_agg(id) from candidates),array[]::uuid[]),'discovery'
    ) e
  )
  select c.id,c.name,c.city,c.category_name,c.photo_url,c.top_moods,c.review_count
  from candidates c join eligibility e on e.entity_id=c.id where e.eligible
  order by e.distribution_priority desc,c.review_count desc,c.name
  limit greatest(1,least(coalesce(p_limit,12),30));
$$;

create or replace function public.backyrd_web_top_spots_v1(
  p_city text default 'Basel',p_limit integer default 6
) returns table(
  spot_id uuid,name text,city text,category_name text,photo_url text,
  top_moods text[],review_count bigint
)
language sql stable security definer set search_path=public,pg_catalog as $$
  select * from public.backyrd_web_city_spots_v1(p_city,greatest(12,least(coalesce(p_limit,6)*4,30)))
  where cardinality(top_moods)>0
  order by review_count desc,name
  limit greatest(1,least(coalesce(p_limit,6),12));
$$;

create or replace function public.backyrd_web_top_moments_v1(p_limit integer default 5)
returns table(
  review_id uuid,spot_id uuid,spot_name text,city text,first_name text,text text,
  mood_a text,mood_b text,photo_url text,likes_count bigint,comments_count bigint,created_at timestamptz
)
language sql stable security definer set search_path=public,pg_catalog as $$
  with likes as (select review_id,count(*)::bigint n from public.review_likes group by review_id),
  comments as (select review_id,count(*)::bigint n from public.review_comments group by review_id),
  candidates as materialized (
    select r.id review_id,r.spot_id,coalesce(nullif(btrim(s.name),''),'Backyrd Spot') spot_name,
      s.city,p.first_name,nullif(btrim(coalesce(r.text,'')),'') text,
      nullif(btrim(coalesce(r.mood_a,'')),'') mood_a,nullif(btrim(coalesce(r.mood_b,'')),'') mood_b,
      nullif(btrim(coalesce(r.photo_path,'')),'') photo_url,coalesce(l.n,0)::bigint likes_count,
      coalesce(cm.n,0)::bigint comments_count,r.created_at,
      coalesce(l.n,0)*3+coalesce(cm.n,0)*5+
        case when nullif(btrim(coalesce(r.photo_path,'')),'') is not null then 2 else 0 end score
    from public.reviews r join public.spots s on s.id=r.spot_id
    left join public.profiles p on p.id=r.user_id
    left join likes l on l.review_id=r.id left join comments cm on cm.review_id=r.id
    where r.created_at>=now()-interval '7 days' and s.status='approved'
  ), eligibility as (
    select e.* from public.distribution_trust_filter_entities_v1(
      'review',coalesce((select array_agg(review_id) from candidates),array[]::uuid[]),'feed'
    ) e
  )
  select c.review_id,c.spot_id,c.spot_name,c.city,c.first_name,c.text,c.mood_a,c.mood_b,
    c.photo_url,c.likes_count,c.comments_count,c.created_at
  from candidates c join eligibility e on e.entity_id=c.review_id where e.eligible
    and public.distribution_trust_entity_is_eligible_v1('spot',c.spot_id,'feed')
  order by e.distribution_priority desc,c.score desc,c.created_at desc
  limit greatest(1,least(coalesce(p_limit,5),10));
$$;

create or replace function public.get_social_feed_v2(
  p_limit integer default 30,p_cursor timestamptz default null,p_city text default null,
  p_feed_mode text default 'for_you'
) returns table(
  post_id uuid,user_id uuid,display_name text,username text,avatar_url text,spot_id uuid,
  spot_name text,spot_city text,category_name text,caption text,visibility text,mood_tags text[],
  occasion_tags text[],media jsonb,like_count integer,comment_count integer,save_count integer,
  viewer_has_liked boolean,viewer_has_saved boolean,viewer_follows_author boolean,created_at timestamptz
)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_me uuid:=auth.uid();v_limit integer:=greatest(1,least(coalesce(p_limit,30),100));
begin
  if v_me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  return query
  select f.* from public.get_social_feed_v1(least(v_limit*8,400),p_cursor,p_city,p_feed_mode) f
  join public.profiles p on p.id=f.user_id
  where (f.user_id=v_me or p.is_private=false)
    and not public.users_are_blocked_v1(v_me,f.user_id)
    and public.distribution_trust_entity_is_eligible_v1('social_post',f.post_id,'feed')
    and (f.spot_id is null or public.distribution_trust_entity_is_eligible_v1('spot',f.spot_id,'feed'))
  order by public.distribution_trust_entity_priority_v1('social_post',f.post_id,'feed') desc,
    f.created_at desc
  limit v_limit;
end;
$$;

create or replace function public.get_social_user_posts_v2(
  p_user_id uuid,p_limit integer default 40,p_cursor timestamptz default null
) returns table(
  post_id uuid,user_id uuid,display_name text,username text,avatar_url text,spot_id uuid,
  spot_name text,spot_city text,category_name text,caption text,visibility text,mood_tags text[],
  occasion_tags text[],media jsonb,like_count integer,comment_count integer,save_count integer,
  viewer_has_liked boolean,viewer_has_saved boolean,viewer_follows_author boolean,created_at timestamptz
)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_me uuid:=auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not public.social_profile_is_accessible_v1(p_user_id) then return; end if;
  return query
  select f.* from public.get_social_user_posts_v1(
    p_user_id,greatest(1,least(coalesce(p_limit,40)*4,200)),p_cursor
  ) f
  where (f.user_id=v_me or (
      exists(select 1 from public.profiles p where p.id=f.user_id and p.is_private=false)
      and public.distribution_trust_entity_is_eligible_v1('social_post',f.post_id,'feed')
    ))
    and not public.users_are_blocked_v1(v_me,f.user_id)
    and (f.spot_id is null or public.distribution_trust_entity_is_eligible_v1('spot',f.spot_id,'feed'))
  order by case when f.user_id=v_me then 100
      else public.distribution_trust_entity_priority_v1('social_post',f.post_id,'feed') end desc,
    f.created_at desc
  limit greatest(1,least(coalesce(p_limit,40),100));
end;
$$;

create or replace function public.distribution_trust_spot_catalog_v1(
  p_query text default null,p_city text default null,p_limit integer default 100,p_surface text default 'search'
) returns table(
  id uuid,name text,address text,lat double precision,lng double precision,category_id uuid,
  category text,category_name text,category_icon text,category_color text,status public.spot_status,
  created_at timestamptz,header_photo_url text,distribution_priority integer
)
language sql stable security definer set search_path=public,pg_catalog as $$
  with candidates as materialized (
    select s.id,s.name,s.address,s.lat,s.lng,s.category_id,c.name category,c.name category_name,
      c.icon category_icon,c.color category_color,s.status,s.created_at,
      coalesce(nullif(s.header_photo_path,''),photo.url) header_photo_url
    from public.spots s left join public.categories c on c.id=s.category_id
    left join lateral (
      select sp.url from public.spot_photos sp where sp.spot_id=s.id and nullif(sp.url,'') is not null
      order by sp.created_at nulls last limit 1
    ) photo on true
    where s.status='approved'
      and (p_city is null or lower(btrim(coalesce(s.city,'')))=lower(btrim(p_city)))
      and (nullif(btrim(coalesce(p_query,'')),'') is null
        or s.name ilike '%'||btrim(p_query)||'%'
        or coalesce(s.address,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(c.name,'') ilike '%'||btrim(p_query)||'%')
  ), eligibility as (
    select e.* from public.distribution_trust_filter_entities_v1(
      'spot',coalesce((select array_agg(id) from candidates),array[]::uuid[]),p_surface
    ) e
  )
  select c.id,c.name,c.address,c.lat,c.lng,c.category_id,c.category,c.category_name,
    c.category_icon,c.category_color,c.status,c.created_at,c.header_photo_url,e.distribution_priority
  from candidates c join eligibility e on e.entity_id=c.id
  where e.eligible
  order by e.distribution_priority desc,c.created_at desc,c.name
  limit greatest(1,least(coalesce(p_limit,100),2000));
$$;

create or replace function public.get_discovery_overview_v1()
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
  with popular as (
    select jsonb_agg(to_jsonb(x)-'distribution_priority') payload from (
      select * from public.distribution_trust_spot_catalog_v1(null,null,12,'discovery')
    ) x
  ), newest as (
    select jsonb_agg(to_jsonb(x)-'distribution_priority') payload from (
      select * from public.distribution_trust_spot_catalog_v1(null,null,12,'discovery')
      order by created_at desc
    ) x
  )
  select jsonb_build_object(
    'trending',coalesce((select payload from popular),'[]'::jsonb),
    'personalized',jsonb_build_object(
      'popular',coalesce((select payload from popular),'[]'::jsonb),
      'newest',coalesce((select payload from newest),'[]'::jsonb),
      'favorites','[]'::jsonb
    )
  );
$$;

create or replace function public.get_my_personalized_home_v1(p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_me uuid:=auth.uid();v_limit integer:=greatest(1,least(coalesce(p_limit,12),30));
  v_for_you jsonb;v_city jsonb;v_favorites jsonb;v_trending jsonb;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)-'distribution_priority'),'[]'::jsonb) into v_for_you
  from (select * from public.distribution_trust_spot_catalog_v1(null,null,v_limit,'discovery')) x;
  v_city:=v_for_you;v_trending:=v_for_you;
  select coalesce(jsonb_agg(to_jsonb(x)-'distribution_priority'),'[]'::jsonb) into v_favorites
  from (
    select c.* from public.favorites f
    join lateral public.distribution_trust_spot_catalog_v1(null,null,200,'discovery') c on c.id=f.spot_id
    where f.user_id=v_me order by f.created_at desc limit v_limit
  ) x;
  return jsonb_build_object('for_you',v_for_you,'your_city',v_city,
    'based_on_favorites',v_favorites,'trending',v_trending);
end;
$$;

create or replace function public.distribution_trust_admin_detail_v1(p_content_item_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.safety_is_admin_v1(auth.uid()) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'content',jsonb_build_object('content_item_id',i.id,'entity_type',i.entity_type,'entity_id',i.entity_id,
      'actor_user_id',i.actor_user_id,'spot_id',i.spot_id),
    'state',to_jsonb(s),
    'policy',jsonb_build_object('engine_version',s.engine_version,
      'rule_key',s.input_snapshot->>'policy_rule','automatic_state',s.automatic_state),
    'affected_consumers',case i.entity_type
      when 'spot' then '["decision","search","discovery","feed","maps"]'::jsonb
      when 'social_post' then '["feed"]'::jsonb
      when 'review' then '["discovery","feed"]'::jsonb
      else '[]'::jsonb end,
    'overrides',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc)
      from public.distribution_trust_overrides o where o.content_item_id=i.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc)
      from public.distribution_trust_history h where h.content_item_id=i.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc)
      from public.distribution_trust_events e where e.content_item_id=i.id),'[]'::jsonb),
    'reasons',coalesce((select jsonb_agg(to_jsonb(r) order by r.reason_code)
      from public.distribution_trust_reason_registry r where r.reason_code=any(s.reason_codes)),'[]'::jsonb)
  ) into v_result
  from public.safety_content_items i
  left join public.distribution_trust_states s on s.content_item_id=i.id
  where i.id=p_content_item_id;
  if v_result is null then raise exception 'distribution_content_item_not_found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

alter table public.distribution_trust_policy_rules enable row level security;
revoke all on table public.distribution_trust_policy_rules from public,anon,authenticated;
grant select on table public.distribution_trust_policy_rules to service_role;

revoke all on function public.distribution_trust_policy_evaluate_v1(jsonb) from public,anon,authenticated;
revoke all on function public.distribution_trust_filter_entities_v1(text,uuid[],text) from public,anon,authenticated;
revoke all on function public.distribution_trust_entity_is_eligible_v1(text,uuid,text) from public,anon,authenticated;
revoke all on function public.distribution_trust_entity_priority_v1(text,uuid,text) from public,anon,authenticated;
revoke all on function public.distribution_trust_sync_spot_registry_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_spot_catalog_v1(text,text,integer,text) from public,anon,authenticated;
revoke all on function public.get_discovery_overview_v1() from public,anon,authenticated;
revoke all on function public.get_my_personalized_home_v1(integer) from public,anon,authenticated;

grant execute on function public.distribution_trust_policy_evaluate_v1(jsonb) to service_role;
grant execute on function public.distribution_trust_filter_entities_v1(text,uuid[],text) to anon,authenticated,service_role;
grant execute on function public.distribution_trust_entity_is_eligible_v1(text,uuid,text) to anon,authenticated,service_role;
grant execute on function public.distribution_trust_entity_priority_v1(text,uuid,text) to anon,authenticated,service_role;
grant execute on function public.distribution_trust_spot_catalog_v1(text,text,integer,text) to anon,authenticated,service_role;
grant execute on function public.get_discovery_overview_v1() to anon,authenticated,service_role;
grant execute on function public.get_my_personalized_home_v1(integer) to authenticated,service_role;

-- Re-evaluate all canonical content with v2. Consumers immediately reflect
-- restorations, successful appeals, expired inputs, and manual override changes.
insert into public.distribution_trust_evaluation_queue(content_item_id,next_evaluation_at,schedule_reason)
select id,now(),'distribution_policy_v2_activation'
from public.safety_content_items
on conflict(content_item_id) do update set
  next_evaluation_at=least(public.distribution_trust_evaluation_queue.next_evaluation_at,excluded.next_evaluation_at),
  schedule_reason=excluded.schedule_reason,updated_at=now();

select public.distribution_trust_evaluate_due_v1(10000,now());

comment on table public.distribution_trust_states is
  'Canonical reversible Distribution decision consumed consistently by Decision, Search, Discovery, Feed and Maps.';
