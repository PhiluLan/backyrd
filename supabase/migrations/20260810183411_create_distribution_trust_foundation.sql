-- Sprint 10: canonical Distribution Trust foundation.
--
-- Distribution Trust answers only how confidently content may be distributed.
-- It consumes canonical Trust and human Safety outcomes, but performs no
-- moderation, enforcement, ranking, recommendation, search, feed, visibility,
-- or source-content mutation.

create table public.distribution_trust_engine_versions (
  version text primary key check (version ~ '^[a-z][a-z0-9_.-]*$'),
  status text not null check (status in ('draft','active','retired')),
  rules jsonb not null check (jsonb_typeof(rules)='object'),
  description text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  check (
    (status='active' and activated_at is not null and retired_at is null)
    or status='draft'
    or (status='retired' and retired_at is not null)
  )
);

create unique index distribution_trust_engine_one_active_idx
  on public.distribution_trust_engine_versions((status)) where status='active';

create table public.distribution_trust_reason_registry (
  reason_code text primary key check (reason_code ~ '^[A-Z][A-Z0-9_]*$'),
  reason_kind text not null check (reason_kind in ('default','trust_input','human_outcome','override','restoration')),
  recommended_state text check (recommended_state is null or recommended_state in ('normal','reduced','quarantined','excluded')),
  source_contract text not null,
  description text not null,
  definition_version integer not null default 1 check (definition_version>0),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.distribution_trust_overrides (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.safety_content_items(id) on delete cascade,
  forced_state text not null check (forced_state in ('normal','reduced','quarantined','excluded')),
  reason_code text not null references public.distribution_trust_reason_registry(reason_code),
  note text check (note is null or length(btrim(note)) between 1 and 2000),
  status text not null default 'active' check (status in ('active','released','expired','superseded')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  released_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at>starts_at),
  check (
    (status='active' and released_at is null and release_reason is null)
    or (status<>'active' and released_at is not null and release_reason is not null)
  )
);

create unique index distribution_trust_one_active_override_idx
  on public.distribution_trust_overrides(content_item_id) where status='active';
create index distribution_trust_overrides_content_idx
  on public.distribution_trust_overrides(content_item_id,created_at desc);

create table public.distribution_trust_states (
  content_item_id uuid primary key references public.safety_content_items(id) on delete cascade,
  engine_version text not null references public.distribution_trust_engine_versions(version),
  automatic_state text not null check (automatic_state in ('normal','reduced','quarantined','excluded')),
  effective_state text not null check (effective_state in ('normal','reduced','quarantined','excluded')),
  reason_codes text[] not null default '{}'::text[],
  automatic_reason_codes text[] not null default '{}'::text[],
  active_override_id uuid references public.distribution_trust_overrides(id) on delete set null,
  evaluation_source text not null check (evaluation_source in ('automatic','manual_override')),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot)='object'),
  state_version bigint not null default 1 check (state_version>0),
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index distribution_trust_states_effective_idx
  on public.distribution_trust_states(effective_state,updated_at desc);

create table public.distribution_trust_history (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.safety_content_items(id) on delete cascade,
  engine_version text not null references public.distribution_trust_engine_versions(version),
  previous_automatic_state text check (previous_automatic_state is null or previous_automatic_state in ('normal','reduced','quarantined','excluded')),
  automatic_state text not null check (automatic_state in ('normal','reduced','quarantined','excluded')),
  previous_effective_state text check (previous_effective_state is null or previous_effective_state in ('normal','reduced','quarantined','excluded')),
  effective_state text not null check (effective_state in ('normal','reduced','quarantined','excluded')),
  transition_source text not null check (transition_source in ('automatic','manual_override','manual_release','override_expiry','initialization')),
  reason_codes text[] not null,
  automatic_reason_codes text[] not null,
  override_id uuid references public.distribution_trust_overrides(id) on delete set null,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot)='object'),
  state_version bigint not null check (state_version>0),
  created_at timestamptz not null default now()
);

create index distribution_trust_history_content_idx
  on public.distribution_trust_history(content_item_id,created_at desc,id desc);

create table public.distribution_trust_events (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.safety_content_items(id) on delete cascade,
  event_type text not null check (event_type in (
    'initialized','state_changed','automatically_restored','override_created',
    'override_released','override_expired','override_superseded'
  )),
  source text not null check (source in ('automatic','admin','system')),
  previous_state text check (previous_state is null or previous_state in ('normal','reduced','quarantined','excluded')),
  new_state text check (new_state is null or new_state in ('normal','reduced','quarantined','excluded')),
  reason_codes text[] not null default '{}'::text[],
  engine_version text not null references public.distribution_trust_engine_versions(version),
  override_id uuid references public.distribution_trust_overrides(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(content_item_id,idempotency_key)
);

create index distribution_trust_events_content_idx
  on public.distribution_trust_events(content_item_id,created_at desc,id desc);

create table public.distribution_trust_evaluation_queue (
  content_item_id uuid primary key references public.safety_content_items(id) on delete cascade,
  next_evaluation_at timestamptz not null default now(),
  schedule_reason text not null,
  attempt_count integer not null default 0 check (attempt_count>=0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index distribution_trust_evaluation_queue_due_idx
  on public.distribution_trust_evaluation_queue(next_evaluation_at,content_item_id);

comment on table public.distribution_trust_states is
  'Canonical, non-enforcing Distribution Trust decision. Consumers are added in later Sprint 10 work.';
comment on table public.distribution_trust_history is
  'Append-only effective and automatic state transition history.';
comment on table public.distribution_trust_overrides is
  'Human Distribution overrides. They do not modify Safety, moderation, source content, or Account Trust.';

insert into public.distribution_trust_engine_versions(
  version,status,rules,description,activated_at
) values(
  'distribution-trust-v1','active',
  '{
    "states":["normal","reduced","quarantined","excluded"],
    "precedence":{"normal":0,"reduced":1,"quarantined":2,"excluded":3},
    "account_trust":{"suspicious":"reduced","high_risk":"reduced"},
    "review_integrity":{"suspicious":"reduced","high_risk":"quarantined"},
    "pending_safety_review":"reduced",
    "human_outcomes":{"allow":"normal","allow_log":"normal","limit":"reduced","temporary_hide":"quarantined","escalate":"quarantined","remove":"excluded","block_submit":"excluded"},
    "automatic_restoration":true,
    "human_override_precedence":true
  }'::jsonb,
  'Sprint 10 canonical Distribution Trust foundation. Produces decisions without product-side consumption.',now()
);

insert into public.distribution_trust_reason_registry(
  reason_code,reason_kind,recommended_state,source_contract,description,metadata
) values
  ('DISTRIBUTION_DEFAULT_NORMAL','default','normal','distribution_trust_v1',
   'No current canonical Trust input recommends reduced distribution.','{"not_a_safety_clearance":true}'::jsonb),
  ('DISTRIBUTION_ACCOUNT_SUSPICIOUS','trust_input','reduced','account_trust_scores',
   'The content actor currently has a suspicious Account Trust risk level.','{"temporary_and_reversible":true}'::jsonb),
  ('DISTRIBUTION_ACCOUNT_HIGH_RISK','trust_input','reduced','account_trust_scores',
   'The content actor currently has a high-risk Account Trust level; Account Trust alone cannot exclude content.','{"single_input_cannot_exclude":true}'::jsonb),
  ('DISTRIBUTION_REVIEW_INTEGRITY_SUSPICIOUS','trust_input','reduced','safety_signals',
   'An unresolved suspicious Review Integrity signal exists.','{"signal_not_proof":true}'::jsonb),
  ('DISTRIBUTION_REVIEW_INTEGRITY_HIGH_RISK','trust_input','quarantined','safety_signals',
   'An unresolved high-risk Review Integrity signal awaits human resolution.','{"pending_human_review":true,"not_removed":true}'::jsonb),
  ('DISTRIBUTION_SAFETY_REVIEW_PENDING','trust_input','reduced','safety_cases',
   'The content has an unresolved Safety case requiring human review.','{"temporary_and_reversible":true}'::jsonb),
  ('DISTRIBUTION_HUMAN_LIMIT','human_outcome','reduced','safety_decision_events',
   'A human decision confirmed a limited distribution outcome.','{"human_confirmed":true}'::jsonb),
  ('DISTRIBUTION_HUMAN_TEMPORARY_HIDE','human_outcome','quarantined','safety_decision_events',
   'A human decision confirmed a temporary-hide outcome.','{"human_confirmed":true,"not_deleted":true}'::jsonb),
  ('DISTRIBUTION_HUMAN_REMOVE','human_outcome','excluded','safety_decision_events',
   'A human decision confirmed a remove outcome. Distribution exclusion remains distinct from deletion.','{"human_confirmed":true,"not_deleted":true}'::jsonb),
  ('DISTRIBUTION_APPEAL_RESTORED','restoration',null,'safety_decision_events',
   'A human appeal outcome restored the automatic distribution recommendation.','{"appeal_aware":true}'::jsonb),
  ('DISTRIBUTION_TRUST_RECOVERED','restoration',null,'distribution_trust_v1',
   'Temporary Trust inputs cleared or expired and automatic distribution improved.','{"automatic_restoration":true}'::jsonb),
  ('DISTRIBUTION_ADMIN_FORCE_NORMAL','override','normal','distribution_trust_overrides',
   'An authorized human forced normal distribution.','{"human_override":true}'::jsonb),
  ('DISTRIBUTION_ADMIN_FORCE_REDUCED','override','reduced','distribution_trust_overrides',
   'An authorized human forced reduced distribution.','{"human_override":true}'::jsonb),
  ('DISTRIBUTION_ADMIN_FORCE_QUARANTINED','override','quarantined','distribution_trust_overrides',
   'An authorized human forced quarantine. Quarantine is not removal.','{"human_override":true}'::jsonb),
  ('DISTRIBUTION_ADMIN_FORCE_EXCLUDED','override','excluded','distribution_trust_overrides',
   'An authorized human forced distribution exclusion. Exclusion is not deletion.','{"human_override":true}'::jsonb),
  ('DISTRIBUTION_ADMIN_RETURN_AUTOMATIC','override',null,'distribution_trust_overrides',
   'An authorized human returned the content to automatic Distribution evaluation.','{"human_override_released":true}'::jsonb);

create or replace function public.distribution_trust_state_rank_v1(p_state text)
returns integer
language sql
immutable
security definer
set search_path=pg_catalog
as $$
  select case p_state when 'normal' then 0 when 'reduced' then 1
    when 'quarantined' then 2 when 'excluded' then 3 else null end;
$$;

create or replace function public.distribution_trust_schedule_content_v1(
  p_content_item_id uuid,p_reason text,p_schedule_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if p_content_item_id is null then return; end if;
  if not exists(select 1 from public.safety_content_items where id=p_content_item_id) then
    raise exception 'distribution_content_item_not_found' using errcode='P0002';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'distribution_schedule_reason_required' using errcode='22023';
  end if;
  insert into public.distribution_trust_evaluation_queue(
    content_item_id,next_evaluation_at,schedule_reason
  ) values(p_content_item_id,coalesce(p_schedule_at,now()),btrim(p_reason))
  on conflict(content_item_id) do update set
    next_evaluation_at=least(public.distribution_trust_evaluation_queue.next_evaluation_at,excluded.next_evaluation_at),
    schedule_reason=excluded.schedule_reason,updated_at=now();
end;
$$;

create or replace function public.distribution_trust_evaluate_content_v1(
  p_content_item_id uuid,p_as_of timestamptz default now(),p_transition_source text default 'automatic'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_item public.safety_content_items%rowtype;v_engine public.distribution_trust_engine_versions%rowtype;
  v_current public.distribution_trust_states%rowtype;v_override public.distribution_trust_overrides%rowtype;
  v_account_risk text;v_integrity_risk text;v_pending_safety boolean:=false;
  v_human_action text;v_human_source text;v_automatic text:='normal';v_effective text;
  v_auto_reasons text[]:='{}';v_reasons text[];v_snapshot jsonb;v_changed boolean:=false;
  v_version bigint:=1;v_event_type text;v_source text:='automatic';v_transition text;
begin
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'distribution_evaluation_time_invalid' using errcode='22023';
  end if;
  if p_transition_source not in ('automatic','manual_override','manual_release','override_expiry','initialization') then
    raise exception 'distribution_transition_source_invalid' using errcode='22023';
  end if;
  select * into v_item from public.safety_content_items where id=p_content_item_id;
  if v_item.id is null then raise exception 'distribution_content_item_not_found' using errcode='P0002'; end if;
  select * into v_engine from public.distribution_trust_engine_versions where status='active';
  if v_engine.version is null then raise exception 'distribution_active_engine_not_found'; end if;

  select * into v_override from public.distribution_trust_overrides
  where content_item_id=p_content_item_id and status='active' for update;
  if v_override.id is not null and v_override.expires_at is not null and v_override.expires_at<=p_as_of then
    update public.distribution_trust_overrides set status='expired',released_at=p_as_of,
      release_reason='override_expired',updated_at=now() where id=v_override.id;
    insert into public.distribution_trust_events(
      content_item_id,event_type,source,reason_codes,engine_version,override_id,idempotency_key,metadata
    ) values(p_content_item_id,'override_expired','system',array['DISTRIBUTION_ADMIN_RETURN_AUTOMATIC'],
      v_engine.version,v_override.id,'override_expired:'||v_override.id,
      jsonb_build_object('expired_at',v_override.expires_at)) on conflict do nothing;
    v_override.id:=null;
    p_transition_source:='override_expiry';
  end if;

  select s.risk_level into v_account_risk from public.account_trust_scores s
  where s.user_id=v_item.actor_user_id;

  select case
    when bool_or(s.categories->>'risk_level'='high_risk') then 'high_risk'
    when bool_or(s.categories->>'risk_level'='suspicious') then 'suspicious'
    else null end
  into v_integrity_risk
  from public.safety_signals s join public.safety_cases c on c.id=s.case_id
  where c.content_item_id=p_content_item_id and s.provider='backyrd_integrity' and s.flagged is true
    and c.case_status in ('queued','evaluating','needs_review','appealed');

  select exists(select 1 from public.safety_cases c
    where c.content_item_id=p_content_item_id and c.case_status='needs_review') into v_pending_safety;

  select d.action,d.source into v_human_action,v_human_source
  from public.safety_decision_events d join public.safety_cases c on c.id=d.case_id
  where c.content_item_id=p_content_item_id
    and d.source in ('human','human_admin','appeal_human')
  order by d.created_at desc,d.id desc limit 1;

  if v_account_risk='suspicious' then
    v_automatic:='reduced';v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_ACCOUNT_SUSPICIOUS');
  elsif v_account_risk='high_risk' then
    v_automatic:='reduced';v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_ACCOUNT_HIGH_RISK');
  end if;
  if v_pending_safety and public.distribution_trust_state_rank_v1(v_automatic)<1 then
    v_automatic:='reduced';
  end if;
  if v_pending_safety then v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_SAFETY_REVIEW_PENDING'); end if;
  if v_integrity_risk='suspicious' then
    if public.distribution_trust_state_rank_v1(v_automatic)<1 then v_automatic:='reduced'; end if;
    v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_REVIEW_INTEGRITY_SUSPICIOUS');
  elsif v_integrity_risk='high_risk' then
    if public.distribution_trust_state_rank_v1(v_automatic)<2 then v_automatic:='quarantined'; end if;
    v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_REVIEW_INTEGRITY_HIGH_RISK');
  end if;

  if v_human_action in ('limit') then
    if public.distribution_trust_state_rank_v1(v_automatic)<1 then v_automatic:='reduced'; end if;
    v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_HUMAN_LIMIT');
  elsif v_human_action in ('temporary_hide','escalate') then
    if public.distribution_trust_state_rank_v1(v_automatic)<2 then v_automatic:='quarantined'; end if;
    v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_HUMAN_TEMPORARY_HIDE');
  elsif v_human_action in ('remove','block_submit') then
    v_automatic:='excluded';v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_HUMAN_REMOVE');
  elsif v_human_action in ('allow','allow_log') and v_human_source='appeal_human' then
    v_auto_reasons:=array_append(v_auto_reasons,'DISTRIBUTION_APPEAL_RESTORED');
  end if;
  if cardinality(v_auto_reasons)=0 then v_auto_reasons:=array['DISTRIBUTION_DEFAULT_NORMAL']; end if;

  if v_override.id is not null then
    v_effective:=v_override.forced_state;
    v_reasons:=array_prepend(v_override.reason_code,v_auto_reasons);
  else
    v_effective:=v_automatic;v_reasons:=v_auto_reasons;
  end if;
  v_source:=case
    when p_transition_source in ('manual_override','manual_release') then 'admin'
    when p_transition_source='override_expiry' then 'system'
    else 'automatic' end;
  v_snapshot:=jsonb_strip_nulls(jsonb_build_object(
    'content_item_id',p_content_item_id,'entity_type',v_item.entity_type,'actor_user_id',v_item.actor_user_id,
    'review_trust',jsonb_build_object('integrity_risk_level',v_integrity_risk),
    'account_trust',jsonb_build_object('risk_level',v_account_risk),
    'safety',jsonb_build_object('needs_review',v_pending_safety,'latest_human_action',v_human_action,
      'latest_human_source',v_human_source),'override_id',v_override.id));

  select * into v_current from public.distribution_trust_states where content_item_id=p_content_item_id for update;
  if v_current.content_item_id is null then
    insert into public.distribution_trust_states(
      content_item_id,engine_version,automatic_state,effective_state,reason_codes,
      automatic_reason_codes,active_override_id,evaluation_source,input_snapshot,evaluated_at
    ) values(p_content_item_id,v_engine.version,v_automatic,v_effective,v_reasons,v_auto_reasons,
      v_override.id,case when v_override.id is null then 'automatic' else 'manual_override' end,v_snapshot,p_as_of);
    v_changed:=true;v_transition:='initialization';v_event_type:='initialized';v_version:=1;
  else
    v_changed:=v_current.engine_version is distinct from v_engine.version
      or v_current.automatic_state is distinct from v_automatic
      or v_current.effective_state is distinct from v_effective
      or v_current.reason_codes is distinct from v_reasons
      or v_current.active_override_id is distinct from v_override.id;
    v_version:=v_current.state_version+case when v_changed then 1 else 0 end;
    update public.distribution_trust_states set engine_version=v_engine.version,
      automatic_state=v_automatic,effective_state=v_effective,reason_codes=v_reasons,
      automatic_reason_codes=v_auto_reasons,active_override_id=v_override.id,
      evaluation_source=case when v_override.id is null then 'automatic' else 'manual_override' end,
      input_snapshot=v_snapshot,state_version=v_version,evaluated_at=p_as_of,updated_at=now()
    where content_item_id=p_content_item_id;
    if v_changed then
      v_transition:=p_transition_source;
      v_event_type:=case
        when v_override.id is null and public.distribution_trust_state_rank_v1(v_effective)
          <public.distribution_trust_state_rank_v1(v_current.effective_state) then 'automatically_restored'
        else 'state_changed' end;
    end if;
  end if;

  if v_changed then
    insert into public.distribution_trust_history(
      content_item_id,engine_version,previous_automatic_state,automatic_state,
      previous_effective_state,effective_state,transition_source,reason_codes,
      automatic_reason_codes,override_id,input_snapshot,state_version
    ) values(p_content_item_id,v_engine.version,v_current.automatic_state,v_automatic,
      v_current.effective_state,v_effective,coalesce(v_transition,'initialization'),v_reasons,
      v_auto_reasons,v_override.id,v_snapshot,v_version);
    insert into public.distribution_trust_events(
      content_item_id,event_type,source,previous_state,new_state,reason_codes,
      engine_version,override_id,idempotency_key,metadata
    ) values(p_content_item_id,v_event_type,v_source,v_current.effective_state,v_effective,
      case when v_event_type='automatically_restored'
        and not ('DISTRIBUTION_APPEAL_RESTORED'=any(v_reasons))
        then array_append(v_reasons,'DISTRIBUTION_TRUST_RECOVERED') else v_reasons end,
      v_engine.version,v_override.id,'state:'||v_version,
      jsonb_build_object('automatic_state',v_automatic,'transition_source',coalesce(v_transition,'initialization')))
    on conflict do nothing;
  end if;
  return jsonb_build_object('content_item_id',p_content_item_id,'engine_version',v_engine.version,
    'automatic_state',v_automatic,'effective_state',v_effective,'reason_codes',to_jsonb(v_reasons),
    'override_id',v_override.id,'changed',v_changed,'state_version',v_version);
end;
$$;

create or replace function public.distribution_trust_set_override_v1(
  p_content_item_id uuid,p_forced_state text,p_reason_code text,p_note text default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_admin uuid:=auth.uid();v_existing public.distribution_trust_overrides%rowtype;
  v_override_id uuid;v_expected text;v_engine text;v_result jsonb;
begin
  if v_admin is null or not public.safety_is_admin_v1(v_admin) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  if p_forced_state not in ('normal','reduced','quarantined','excluded') then
    raise exception 'distribution_state_invalid' using errcode='22023';
  end if;
  if p_expires_at is not null and p_expires_at<=now() then
    raise exception 'distribution_override_expiry_invalid' using errcode='22023';
  end if;
  if p_note is not null and length(btrim(p_note)) not between 1 and 2000 then
    raise exception 'distribution_override_note_invalid' using errcode='22023';
  end if;
  select recommended_state into v_expected from public.distribution_trust_reason_registry
  where reason_code=p_reason_code and reason_kind='override' and enabled;
  if v_expected is null or v_expected<>p_forced_state then
    raise exception 'distribution_override_reason_invalid' using errcode='22023';
  end if;
  perform 1 from public.safety_content_items where id=p_content_item_id for update;
  if not found then raise exception 'distribution_content_item_not_found' using errcode='P0002'; end if;
  select * into v_existing from public.distribution_trust_overrides
  where content_item_id=p_content_item_id and status='active' for update;
  if v_existing.id is not null and v_existing.forced_state=p_forced_state
     and v_existing.reason_code=p_reason_code and v_existing.note is not distinct from nullif(btrim(p_note),'')
     and v_existing.expires_at is not distinct from p_expires_at then
    return public.distribution_trust_evaluate_content_v1(p_content_item_id,now(),'manual_override')
      ||jsonb_build_object('override_id',v_existing.id,'duplicate',true);
  end if;
  select version into v_engine from public.distribution_trust_engine_versions where status='active';
  if v_existing.id is not null then
    update public.distribution_trust_overrides set status='superseded',released_by=v_admin,released_at=now(),
      release_reason='superseded_by_new_override',updated_at=now() where id=v_existing.id;
    insert into public.distribution_trust_events(
      content_item_id,event_type,source,reason_codes,engine_version,override_id,actor_user_id,idempotency_key
    ) values(p_content_item_id,'override_superseded','admin',array[p_reason_code],v_engine,
      v_existing.id,v_admin,'override_superseded:'||v_existing.id) on conflict do nothing;
  end if;
  insert into public.distribution_trust_overrides(
    content_item_id,forced_state,reason_code,note,expires_at,created_by
  ) values(p_content_item_id,p_forced_state,p_reason_code,nullif(btrim(p_note),''),p_expires_at,v_admin)
  returning id into v_override_id;
  insert into public.distribution_trust_events(
    content_item_id,event_type,source,new_state,reason_codes,engine_version,override_id,
    actor_user_id,idempotency_key,metadata
  ) values(p_content_item_id,'override_created','admin',p_forced_state,array[p_reason_code],v_engine,
    v_override_id,v_admin,'override_created:'||v_override_id,
    jsonb_build_object('expires_at',p_expires_at)) on conflict do nothing;
  v_result:=public.distribution_trust_evaluate_content_v1(p_content_item_id,now(),'manual_override');
  return v_result||jsonb_build_object('override_id',v_override_id,'duplicate',false);
end;
$$;

create or replace function public.distribution_trust_release_override_v1(
  p_content_item_id uuid,p_reason text default 'return_to_automatic'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_admin uuid:=auth.uid();v_override public.distribution_trust_overrides%rowtype;v_engine text;
begin
  if v_admin is null or not public.safety_is_admin_v1(v_admin) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'distribution_override_release_reason_invalid' using errcode='22023';
  end if;
  select * into v_override from public.distribution_trust_overrides
  where content_item_id=p_content_item_id and status='active' for update;
  if v_override.id is null then
    return public.distribution_trust_evaluate_content_v1(p_content_item_id,now(),'manual_release')
      ||jsonb_build_object('duplicate',true);
  end if;
  update public.distribution_trust_overrides set status='released',released_by=v_admin,released_at=now(),
    release_reason=btrim(p_reason),updated_at=now() where id=v_override.id;
  select version into v_engine from public.distribution_trust_engine_versions where status='active';
  insert into public.distribution_trust_events(
    content_item_id,event_type,source,reason_codes,engine_version,override_id,actor_user_id,idempotency_key,metadata
  ) values(p_content_item_id,'override_released','admin',array['DISTRIBUTION_ADMIN_RETURN_AUTOMATIC'],
    v_engine,v_override.id,v_admin,'override_released:'||v_override.id,jsonb_build_object('reason',btrim(p_reason)))
  on conflict do nothing;
  return public.distribution_trust_evaluate_content_v1(p_content_item_id,now(),'manual_release')
    ||jsonb_build_object('override_id',v_override.id,'duplicate',false);
end;
$$;

create or replace function public.distribution_trust_evaluate_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_queue record;v_processed integer:=0;v_changed integer:=0;v_result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then
    raise exception 'distribution_evaluation_limit_invalid' using errcode='22023';
  end if;
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'distribution_evaluation_time_invalid' using errcode='22023';
  end if;
  for v_queue in select content_item_id from public.distribution_trust_evaluation_queue
    where next_evaluation_at<=p_as_of order by next_evaluation_at,content_item_id
    limit p_limit for update skip locked
  loop
    begin
      v_result:=public.distribution_trust_evaluate_content_v1(v_queue.content_item_id,p_as_of,'automatic');
      delete from public.distribution_trust_evaluation_queue where content_item_id=v_queue.content_item_id;
      v_processed:=v_processed+1;
      if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
    exception when others then
      update public.distribution_trust_evaluation_queue set attempt_count=attempt_count+1,
        last_error=left(sqlstate||':'||sqlerrm,500),next_evaluation_at=p_as_of+interval '15 minutes',updated_at=now()
      where content_item_id=v_queue.content_item_id;
    end;
  end loop;
  return jsonb_build_object('processed',v_processed,'changed',v_changed);
end;
$$;

create or replace function public.distribution_trust_admin_overview_v1(
  p_state text default null,p_limit integer default 200
) returns table(
  content_item_id uuid,entity_type text,entity_id uuid,actor_user_id uuid,
  automatic_state text,effective_state text,reason_codes text[],evaluation_source text,
  active_override_id uuid,evaluated_at timestamptz
)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if auth.uid() is null or not public.safety_is_admin_v1(auth.uid()) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  if p_state is not null and p_state not in ('normal','reduced','quarantined','excluded') then
    raise exception 'distribution_state_invalid' using errcode='22023';
  end if;
  return query select i.id,i.entity_type,i.entity_id,i.actor_user_id,s.automatic_state,s.effective_state,
    s.reason_codes,s.evaluation_source,s.active_override_id,s.evaluated_at
  from public.distribution_trust_states s join public.safety_content_items i on i.id=s.content_item_id
  where p_state is null or s.effective_state=p_state
  order by public.distribution_trust_state_rank_v1(s.effective_state) desc,s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

create or replace function public.distribution_trust_admin_detail_v1(p_content_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.safety_is_admin_v1(auth.uid()) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'content',jsonb_build_object('content_item_id',i.id,'entity_type',i.entity_type,'entity_id',i.entity_id,
      'actor_user_id',i.actor_user_id,'spot_id',i.spot_id),
    'state',to_jsonb(s),
    'overrides',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc)
      from public.distribution_trust_overrides o where o.content_item_id=i.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc)
      from public.distribution_trust_history h where h.content_item_id=i.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc)
      from public.distribution_trust_events e where e.content_item_id=i.id),'[]'::jsonb),
    'reasons',coalesce((select jsonb_agg(to_jsonb(r) order by r.reason_code)
      from public.distribution_trust_reason_registry r where r.reason_code=any(s.reason_codes)),'[]'::jsonb)
  ) into v_result from public.safety_content_items i
  left join public.distribution_trust_states s on s.content_item_id=i.id where i.id=p_content_item_id;
  if v_result is null then raise exception 'distribution_content_item_not_found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.distribution_trust_schedule_from_content_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin perform public.distribution_trust_schedule_content_v1(new.id,'content_registry_changed',now());return new;end;
$$;
create or replace function public.distribution_trust_schedule_from_case_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin perform public.distribution_trust_schedule_content_v1(new.content_item_id,'safety_case_changed',now());return new;end;
$$;
create or replace function public.distribution_trust_schedule_from_signal_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_content uuid;begin select content_item_id into v_content from public.safety_cases where id=new.case_id;
  if v_content is not null then perform public.distribution_trust_schedule_content_v1(v_content,'safety_signal_changed',now());end if;return new;end;
$$;
create or replace function public.distribution_trust_schedule_from_decision_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_content uuid;begin select content_item_id into v_content from public.safety_cases where id=new.case_id;
  if v_content is not null then perform public.distribution_trust_schedule_content_v1(v_content,'safety_decision_changed',now());end if;return new;end;
$$;
create or replace function public.distribution_trust_schedule_from_appeal_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_content uuid;begin select content_item_id into v_content from public.safety_cases where id=new.case_id;
  if v_content is not null then perform public.distribution_trust_schedule_content_v1(v_content,'appeal_changed',now());end if;return new;end;
$$;
create or replace function public.distribution_trust_schedule_from_account_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  insert into public.distribution_trust_evaluation_queue(content_item_id,next_evaluation_at,schedule_reason)
  select i.id,now(),'account_trust_changed' from public.safety_content_items i where i.actor_user_id=new.user_id
  on conflict(content_item_id) do update set next_evaluation_at=least(public.distribution_trust_evaluation_queue.next_evaluation_at,excluded.next_evaluation_at),
    schedule_reason=excluded.schedule_reason,updated_at=now();return new;
end;
$$;

create trigger trg_distribution_trust_content_v1 after insert or update of actor_user_id,lifecycle_status
  on public.safety_content_items for each row execute function public.distribution_trust_schedule_from_content_v1();
create trigger trg_distribution_trust_case_v1 after insert or update of case_status,final_action,decision_source
  on public.safety_cases for each row execute function public.distribution_trust_schedule_from_case_v1();
create trigger trg_distribution_trust_signal_v1 after insert on public.safety_signals
  for each row execute function public.distribution_trust_schedule_from_signal_v1();
create trigger trg_distribution_trust_decision_v1 after insert on public.safety_decision_events
  for each row execute function public.distribution_trust_schedule_from_decision_v1();
create trigger trg_distribution_trust_appeal_v1 after insert or update of status,outcome
  on public.safety_appeals for each row execute function public.distribution_trust_schedule_from_appeal_v1();
create trigger trg_distribution_trust_account_v1 after insert or update of risk_level,trust_score
  on public.account_trust_scores for each row execute function public.distribution_trust_schedule_from_account_v1();

insert into public.distribution_trust_evaluation_queue(content_item_id,next_evaluation_at,schedule_reason)
select id,now(),'foundation_initialization' from public.safety_content_items on conflict do nothing;
select public.distribution_trust_evaluate_due_v1(10000,now());

alter table public.distribution_trust_engine_versions enable row level security;
alter table public.distribution_trust_reason_registry enable row level security;
alter table public.distribution_trust_overrides enable row level security;
alter table public.distribution_trust_states enable row level security;
alter table public.distribution_trust_history enable row level security;
alter table public.distribution_trust_events enable row level security;
alter table public.distribution_trust_evaluation_queue enable row level security;

revoke all on table public.distribution_trust_engine_versions from public,anon,authenticated;
revoke all on table public.distribution_trust_reason_registry from public,anon,authenticated;
revoke all on table public.distribution_trust_overrides from public,anon,authenticated;
revoke all on table public.distribution_trust_states from public,anon,authenticated;
revoke all on table public.distribution_trust_history from public,anon,authenticated;
revoke all on table public.distribution_trust_events from public,anon,authenticated;
revoke all on table public.distribution_trust_evaluation_queue from public,anon,authenticated;
grant select on table
  public.distribution_trust_engine_versions,
  public.distribution_trust_reason_registry,
  public.distribution_trust_overrides,
  public.distribution_trust_states,
  public.distribution_trust_history,
  public.distribution_trust_events,
  public.distribution_trust_evaluation_queue
to service_role;

revoke all on function public.distribution_trust_state_rank_v1(text) from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_content_v1(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.distribution_trust_evaluate_content_v1(uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.distribution_trust_set_override_v1(uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.distribution_trust_release_override_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.distribution_trust_evaluate_due_v1(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.distribution_trust_admin_overview_v1(text,integer) from public,anon,authenticated;
revoke all on function public.distribution_trust_admin_detail_v1(uuid) from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_from_content_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_from_case_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_from_signal_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_from_decision_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_from_appeal_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_schedule_from_account_v1() from public,anon,authenticated;

grant execute on function public.distribution_trust_state_rank_v1(text) to service_role;
grant execute on function public.distribution_trust_schedule_content_v1(uuid,text,timestamptz) to service_role;
grant execute on function public.distribution_trust_evaluate_content_v1(uuid,timestamptz,text) to service_role;
grant execute on function public.distribution_trust_evaluate_due_v1(integer,timestamptz) to service_role;
grant execute on function public.distribution_trust_set_override_v1(uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.distribution_trust_release_override_v1(uuid,text) to authenticated;
grant execute on function public.distribution_trust_admin_overview_v1(text,integer) to authenticated;
grant execute on function public.distribution_trust_admin_detail_v1(uuid) to authenticated;

comment on function public.distribution_trust_evaluate_content_v1(uuid,timestamptz,text) is
  'Service-only canonical Distribution decision. Reads Trust/Safety contracts and writes only Distribution audit state.';
comment on function public.distribution_trust_set_override_v1(uuid,text,text,text,timestamptz) is
  'Admin-only reversible Distribution override; does not mutate source content or moderation state.';
