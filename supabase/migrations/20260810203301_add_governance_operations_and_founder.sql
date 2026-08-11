-- Sprint 11: Governance operations, Break Glass, explainability, health and
-- Founder oversight. Normal mode preserves all existing Trust and product
-- behavior. Emergency controls are bounded, reversible and fully audited.

create table public.governance_system_controls (
  control_key text primary key check (control_key in (
    'trust_automation','safety_automation','distribution_automation'
  )),
  current_mode text not null check (current_mode in ('automatic','manual_only','paused')),
  fail_strategy text not null check (fail_strategy in (
    'manual_fallback','fail_closed_last_known'
  )),
  active_break_glass_id uuid,
  governance_version text not null references public.governance_versions(version),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (
    (current_mode='automatic' and active_break_glass_id is null)
    or (current_mode<>'automatic' and active_break_glass_id is not null)
  )
);

create table public.governance_break_glass_events (
  id uuid primary key default gen_random_uuid(),
  control_key text not null references public.governance_system_controls(control_key),
  incident_id uuid not null references public.governance_incidents(id) on delete restrict,
  previous_mode text not null check (previous_mode in ('automatic','manual_only','paused')),
  requested_mode text not null check (requested_mode in ('manual_only','paused')),
  status text not null default 'active' check (status in ('active','released','expired','superseded')),
  reason text not null check (length(btrim(reason)) between 20 and 2000),
  activated_by uuid not null references public.profiles(id) on delete restrict,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_by uuid references public.profiles(id) on delete restrict,
  released_at timestamptz,
  release_reason text check (release_reason is null or length(btrim(release_reason)) between 10 and 2000),
  governance_version text not null references public.governance_versions(version),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  check (expires_at>activated_at and expires_at<=activated_at+interval '24 hours'),
  check (
    (status='active' and released_by is null and released_at is null and release_reason is null)
    or (status<>'active' and released_at is not null and release_reason is not null)
  )
);

-- Enable RLS before the circular, deferred Break Glass relationship is
-- established. PostgreSQL otherwise retains a deferred FK trigger event from
-- the seed rows and refuses a later ALTER TABLE in the same migration.
alter table public.governance_system_controls enable row level security;
alter table public.governance_break_glass_events enable row level security;

alter table public.governance_system_controls
  add constraint governance_system_controls_break_glass_fk
  foreign key(active_break_glass_id) references public.governance_break_glass_events(id)
  deferrable initially deferred;

create unique index governance_break_glass_one_active_control_idx
  on public.governance_break_glass_events(control_key) where status='active';
create index governance_break_glass_expiry_idx
  on public.governance_break_glass_events(expires_at) where status='active';

insert into public.governance_system_controls(
  control_key,current_mode,fail_strategy,governance_version
) values
  ('trust_automation','automatic','manual_fallback','governance-v1'),
  ('safety_automation','automatic','manual_fallback','governance-v1'),
  ('distribution_automation','automatic','fail_closed_last_known','governance-v1');

create or replace function public.governance_effective_control_mode_v1(p_control_key text)
returns text language sql stable security definer set search_path=public,pg_catalog as $$
  select case
    when c.active_break_glass_id is null then 'automatic'
    when b.status<>'active' or b.expires_at<=now() then 'automatic'
    else c.current_mode
  end
  from public.governance_system_controls c
  left join public.governance_break_glass_events b on b.id=c.active_break_glass_id
  where c.control_key=p_control_key;
$$;

-- Central automation gates. The original implementations remain private and
-- callable only by these wrappers. Normal mode is behavior-identical; bounded
-- Break Glass pauses scheduled Trust evaluation or new Safety worker claims
-- without deleting queues, evidence, state or audit history.
alter function public.account_trust_evaluate_identity_due_v1(integer,timestamptz)
  rename to account_trust_evaluate_identity_due_uncontrolled_v1;
alter function public.account_trust_evaluate_behaviour_due_v1(integer,timestamptz)
  rename to account_trust_evaluate_behaviour_due_uncontrolled_v1;
alter function public.account_trust_evaluate_network_due_v1(integer,timestamptz)
  rename to account_trust_evaluate_network_due_uncontrolled_v1;
alter function public.account_trust_evaluate_security_due_v1(integer,timestamptz)
  rename to account_trust_evaluate_security_due_uncontrolled_v1;
alter function public.account_trust_evaluate_owner_due_v1(integer,timestamptz)
  rename to account_trust_evaluate_owner_due_uncontrolled_v1;
alter function public.account_trust_evaluate_reputation_due_v1(integer,timestamptz)
  rename to account_trust_evaluate_reputation_due_uncontrolled_v1;

create or replace function public.account_trust_evaluate_identity_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('trust_automation')<>'automatic' then
    return jsonb_build_object('processed',0,'signals_emitted',0,'paused',true,'control','trust_automation');
  end if;
  return public.account_trust_evaluate_identity_due_uncontrolled_v1(p_limit,p_as_of);
end;
$$;

create or replace function public.account_trust_evaluate_behaviour_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('trust_automation')<>'automatic' then
    return jsonb_build_object('processed',0,'signals_emitted',0,'paused',true,'control','trust_automation');
  end if;
  return public.account_trust_evaluate_behaviour_due_uncontrolled_v1(p_limit,p_as_of);
end;
$$;

create or replace function public.account_trust_evaluate_network_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('trust_automation')<>'automatic' then
    return jsonb_build_object('processed',0,'signals_emitted',0,'paused',true,'control','trust_automation');
  end if;
  return public.account_trust_evaluate_network_due_uncontrolled_v1(p_limit,p_as_of);
end;
$$;

create or replace function public.account_trust_evaluate_security_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('trust_automation')<>'automatic' then
    return jsonb_build_object('processed',0,'signals_emitted',0,'paused',true,'control','trust_automation');
  end if;
  return public.account_trust_evaluate_security_due_uncontrolled_v1(p_limit,p_as_of);
end;
$$;

create or replace function public.account_trust_evaluate_owner_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('trust_automation')<>'automatic' then
    return jsonb_build_object('processed',0,'signals_emitted',0,'paused',true,'control','trust_automation');
  end if;
  return public.account_trust_evaluate_owner_due_uncontrolled_v1(p_limit,p_as_of);
end;
$$;

create or replace function public.account_trust_evaluate_reputation_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('trust_automation')<>'automatic' then
    return jsonb_build_object('processed',0,'signals_emitted',0,'paused',true,'control','trust_automation');
  end if;
  return public.account_trust_evaluate_reputation_due_uncontrolled_v1(p_limit,p_as_of);
end;
$$;

alter function public.safety_claim_text_jobs_v1(text,integer)
  rename to safety_claim_text_jobs_uncontrolled_v1;
alter function public.safety_claim_image_jobs_v1(text,integer)
  rename to safety_claim_image_jobs_uncontrolled_v1;

create or replace function public.safety_claim_text_jobs_v1(
  p_worker_id text,p_limit integer default 10
) returns table(job_id uuid,case_id uuid,content_item_id uuid,attempt_count integer)
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('safety_automation')<>'automatic' then return; end if;
  return query select * from public.safety_claim_text_jobs_uncontrolled_v1(p_worker_id,p_limit);
end;
$$;

create or replace function public.safety_claim_image_jobs_v1(
  p_worker_id text,p_limit integer default 5
) returns table(job_id uuid,case_id uuid,content_item_id uuid,image_index integer,
  image_reference text,attempt_count integer)
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if public.governance_effective_control_mode_v1('safety_automation')<>'automatic' then return; end if;
  return query select * from public.safety_claim_image_jobs_uncontrolled_v1(p_worker_id,p_limit);
end;
$$;

create or replace function public.governance_activate_break_glass_v1(
  p_control_key text,p_requested_mode text,p_incident_id uuid,p_reason text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_incident public.governance_incidents%rowtype;
  v_existing public.governance_break_glass_events%rowtype;v_id uuid:=gen_random_uuid();
  v_version text:=public.governance_active_version_v1();v_control public.governance_system_controls%rowtype;
begin
  if v_actor is null or not public.governance_has_authority_v1('trust_admin',v_actor) then
    raise exception 'governance_break_glass_authority_required' using errcode='42501';
  end if;
  select * into v_incident from public.governance_incidents where id=p_incident_id for update;
  if v_incident.id is null then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  if v_incident.severity_key not in ('S3','S4') or v_incident.status in ('resolved','closed') then
    raise exception 'governance_break_glass_major_open_incident_required' using errcode='23514';
  end if;
  if v_incident.severity_key='S4' and not public.governance_has_authority_v1('founder',v_actor) then
    raise exception 'governance_critical_break_glass_founder_required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 20 and 2000
     or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '24 hours' then
    raise exception 'governance_break_glass_contract_invalid' using errcode='22023';
  end if;
  select * into v_control from public.governance_system_controls where control_key=p_control_key for update;
  if v_control.control_key is null or p_requested_mode not in ('manual_only','paused')
     or (p_control_key='distribution_automation' and p_requested_mode<>'paused') then
    raise exception 'governance_break_glass_mode_invalid' using errcode='22023';
  end if;
  select * into v_existing from public.governance_break_glass_events
    where control_key=p_control_key and status='active' for update;
  if v_existing.id is not null and v_existing.requested_mode=p_requested_mode
     and v_existing.incident_id=p_incident_id and v_existing.expires_at=p_expires_at
     and v_existing.reason=btrim(p_reason) then
    return jsonb_build_object('break_glass_id',v_existing.id,'mode',p_requested_mode,'duplicate',true);
  end if;
  if v_existing.id is not null then
    update public.governance_break_glass_events set status='superseded',released_by=v_actor,
      released_at=now(),release_reason='Superseded by a newer accountable Break Glass action.'
    where id=v_existing.id;
  end if;
  insert into public.governance_break_glass_events(
    id,control_key,incident_id,previous_mode,requested_mode,reason,activated_by,
    expires_at,governance_version
  ) values(
    v_id,p_control_key,p_incident_id,
    case when v_existing.id is null then v_control.current_mode else v_existing.requested_mode end,
    p_requested_mode,btrim(p_reason),v_actor,p_expires_at,v_version
  );
  update public.governance_system_controls set current_mode=p_requested_mode,
    active_break_glass_id=v_id,updated_at=now(),updated_by=v_actor
  where control_key=p_control_key;
  insert into public.governance_incident_timeline(
    incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata
  ) values(
    p_incident_id,'mitigation','Break Glass activated: '||p_control_key||' → '||p_requested_mode,
    now(),v_actor,'human',jsonb_build_object('break_glass_id',v_id,'expires_at',p_expires_at)
  );
  perform public.governance_write_audit_v1(
    'break_glass_activated:'||v_id,p_incident_id,'break_glass',v_id::text,'activated',
    v_actor,'human',btrim(p_reason),jsonb_build_object('mode',v_control.current_mode),
    jsonb_build_object('mode',p_requested_mode,'expires_at',p_expires_at)
  );
  return jsonb_build_object('break_glass_id',v_id,'mode',p_requested_mode,'duplicate',false,'expires_at',p_expires_at);
end;
$$;

create or replace function public.governance_release_break_glass_v1(
  p_control_key text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_control public.governance_system_controls%rowtype;
  v_event public.governance_break_glass_events%rowtype;
begin
  if v_actor is null or not public.governance_has_authority_v1('trust_admin',v_actor) then
    raise exception 'governance_break_glass_authority_required' using errcode='42501';
  end if;
  select * into v_control from public.governance_system_controls where control_key=p_control_key for update;
  if v_control.control_key is null then raise exception 'governance_control_not_found' using errcode='P0002'; end if;
  if v_control.active_break_glass_id is null then
    return jsonb_build_object('control_key',p_control_key,'mode','automatic','duplicate',true);
  end if;
  select * into v_event from public.governance_break_glass_events where id=v_control.active_break_glass_id for update;
  update public.governance_break_glass_events set status='released',released_by=v_actor,
    released_at=now(),release_reason=btrim(p_reason) where id=v_event.id;
  update public.governance_system_controls set current_mode='automatic',active_break_glass_id=null,
    updated_at=now(),updated_by=v_actor where control_key=p_control_key;
  insert into public.governance_incident_timeline(
    incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata
  ) values(v_event.incident_id,'restoration','Break Glass released; automatic operation restored.',now(),
    v_actor,'human',jsonb_build_object('break_glass_id',v_event.id,'control_key',p_control_key));
  perform public.governance_write_audit_v1(
    'break_glass_released:'||v_event.id,v_event.incident_id,'break_glass',v_event.id::text,
    'released',v_actor,'human',btrim(p_reason),jsonb_build_object('mode',v_event.requested_mode),
    jsonb_build_object('mode','automatic')
  );
  return jsonb_build_object('control_key',p_control_key,'mode','automatic','duplicate',false);
end;
$$;

create or replace function public.governance_expire_break_glass_v1(
  p_as_of timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_event record;v_count integer:=0;
begin
  if auth.role()<>'service_role' then
    raise exception 'governance_service_role_required' using errcode='42501';
  end if;
  for v_event in select * from public.governance_break_glass_events
    where status='active' and expires_at<=coalesce(p_as_of,now()) for update skip locked
  loop
    update public.governance_break_glass_events set status='expired',released_at=coalesce(p_as_of,now()),
      release_reason='Bounded Break Glass duration expired automatically.' where id=v_event.id;
    update public.governance_system_controls set current_mode='automatic',active_break_glass_id=null,
      updated_at=coalesce(p_as_of,now()),updated_by=null
    where control_key=v_event.control_key and active_break_glass_id=v_event.id;
    insert into public.governance_incident_timeline(
      incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata
    ) values(v_event.incident_id,'restoration','Break Glass expired; automatic operation restored.',
      coalesce(p_as_of,now()),null,'system',jsonb_build_object('break_glass_id',v_event.id));
    perform public.governance_write_audit_v1(
      'break_glass_expired:'||v_event.id,v_event.incident_id,'break_glass',v_event.id::text,
      'expired',null,'system','Bounded Break Glass duration expired automatically.',
      jsonb_build_object('mode',v_event.requested_mode),jsonb_build_object('mode','automatic')
    );
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('expired',v_count,'as_of',coalesce(p_as_of,now()));
end;
$$;

-- Distribution has one central automated entrypoint. Break Glass pauses that
-- entrypoint while consumers safely retain the last known canonical state.
create or replace function public.distribution_trust_evaluate_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_queue record;v_processed integer:=0;v_changed integer:=0;v_result jsonb;
begin
  if public.governance_effective_control_mode_v1('distribution_automation')<>'automatic' then
    return jsonb_build_object(
      'processed',0,'changed',0,'paused',true,
      'failsafe','last_known_canonical_state','governance_version',public.governance_active_version_v1()
    );
  end if;
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
      insert into public.distribution_trust_evaluation_queue(
        content_item_id,next_evaluation_at,schedule_reason
      )
      select o.content_item_id,o.expires_at,'override_expiry'
      from public.distribution_trust_overrides o
      where o.content_item_id=v_queue.content_item_id and o.status='active'
        and o.expires_at is not null and o.expires_at>p_as_of
      on conflict(content_item_id) do update set
        next_evaluation_at=least(public.distribution_trust_evaluation_queue.next_evaluation_at,excluded.next_evaluation_at),
        schedule_reason=excluded.schedule_reason,attempt_count=0,last_error=null,updated_at=now();
      v_processed:=v_processed+1;
      if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
    exception when others then
      update public.distribution_trust_evaluation_queue set attempt_count=attempt_count+1,
        last_error=left(sqlstate||':'||sqlerrm,500),next_evaluation_at=p_as_of+interval '15 minutes',updated_at=now()
      where content_item_id=v_queue.content_item_id;
    end;
  end loop;
  return jsonb_build_object('processed',v_processed,'changed',v_changed,'paused',false);
end;
$$;

create or replace function public.governance_capture_distribution_override_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=coalesce(new.released_by,new.created_by);v_action text;
begin
  v_action:=case when tg_op='INSERT' then 'created' else 'status_changed' end;
  perform public.governance_write_audit_v1(
    'distribution_override:'||new.id||':'||new.status,null,'distribution_override',new.id::text,
    v_action,v_actor,'human',coalesce(new.release_reason,'Accountable Distribution override action.'),
    case when tg_op='UPDATE' then jsonb_build_object('status',old.status,'forced_state',old.forced_state) else null end,
    jsonb_build_object('status',new.status,'forced_state',new.forced_state,'content_item_id',new.content_item_id)
  );
  return new;
end;
$$;

create trigger trg_governance_distribution_override_audit
after insert or update of status on public.distribution_trust_overrides
for each row execute function public.governance_capture_distribution_override_v1();

create or replace function public.governance_capture_safety_decision_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.governance_write_audit_v1(
    'safety_decision:'||new.id,null,'safety_decision',new.id::text,'recorded',new.actor_user_id,
    case when new.actor_user_id is null then 'system' else 'human' end,
    coalesce(nullif(array_to_string(new.reason_codes,','),''),'Safety decision recorded.'),null,
    jsonb_build_object('case_id',new.case_id,'action',new.action,'source',new.source,
      'reason_codes',new.reason_codes,'policy_version',new.policy_snapshot->>'policy_version')
  );
  return new;
end;
$$;

create trigger trg_governance_safety_decision_audit
after insert on public.safety_decision_events
for each row execute function public.governance_capture_safety_decision_v1();

create or replace function public.governance_capture_appeal_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=coalesce(new.reviewer_id,new.appellant_user_id);v_action text;
begin
  v_action:=case when tg_op='INSERT' then 'submitted' else 'status_changed' end;
  perform public.governance_write_audit_v1(
    'appeal:'||new.id||':'||new.status,null,'appeal',new.id::text,v_action,v_actor,'human',
    'Appeal lifecycle action recorded.',
    case when tg_op='UPDATE' then jsonb_build_object('status',old.status,'outcome',old.outcome) else null end,
    jsonb_build_object('status',new.status,'outcome',new.outcome,'case_id',new.case_id)
  );
  return new;
end;
$$;

create trigger trg_governance_appeal_audit
after insert or update of status,outcome on public.safety_appeals
for each row execute function public.governance_capture_appeal_v1();

-- Distribution owns access to its state. Governance consumes these bounded,
-- privacy-safe contracts rather than reading Distribution internals directly.
create or replace function public.distribution_trust_governance_explain_v1(
  p_content_item_id uuid
) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.governance_has_authority_v1('moderator',auth.uid()) then
    raise exception 'governance_moderator_required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'domain','distribution','subject_id',s.content_item_id,'current_state',s.effective_state,
    'human_explanation',case s.effective_state
      when 'normal' then 'The content currently has normal distribution eligibility.'
      when 'reduced' then 'Distribution is temporarily reduced while current Trust context is evaluated.'
      when 'quarantined' then 'Distribution is temporarily quarantined pending accountable resolution.'
      else 'The content is excluded from distribution by the current accountable contract.' end,
    'technical_explanation',jsonb_build_object(
      'automatic_state',s.automatic_state,'evaluation_source',s.evaluation_source,
      'state_version',s.state_version,'reason_codes',s.reason_codes),
    'policy_version',s.engine_version,
    'evidence_references',coalesce((select jsonb_agg(jsonb_build_object(
      'reason_code',r.reason_code,'description',r.description,'source_contract',r.source_contract))
      from public.distribution_trust_reason_registry r where r.reason_code=any(s.reason_codes)),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'previous_state',h.previous_effective_state,'new_state',h.effective_state,
      'source',h.transition_source,'reason_codes',h.reason_codes,'created_at',h.created_at)
      order by h.created_at desc,h.id desc) from public.distribution_trust_history h
      where h.content_item_id=s.content_item_id),'[]'::jsonb)
  ) into v_result from public.distribution_trust_states s where s.content_item_id=p_content_item_id;
  return v_result;
end;
$$;

create or replace function public.distribution_trust_governance_health_v1()
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if auth.role()<>'service_role'
     and (auth.uid() is null or not public.governance_has_authority_v1('moderator',auth.uid())) then
    raise exception 'governance_health_access_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'failed_evaluations',(select count(*) from public.distribution_trust_evaluation_queue
      where attempt_count>0 or last_error is not null),
    'due_evaluations',(select count(*) from public.distribution_trust_evaluation_queue
      where next_evaluation_at<=now()),
    'overdue_evaluations',(select count(*) from public.distribution_trust_evaluation_queue
      where next_evaluation_at<now()-interval '10 minutes'),
    'orphan_overrides',(select count(*) from public.distribution_trust_overrides o
      where o.status='active' and (o.expires_at<=now() or not exists(
        select 1 from public.distribution_trust_states s where s.active_override_id=o.id))),
    'missing_restorations',(select count(*) from public.distribution_trust_states s
      join public.distribution_trust_overrides o on o.id=s.active_override_id where o.status<>'active')
  );
end;
$$;

create or replace function public.governance_decision_explain_v1(
  p_domain text,p_subject_id uuid
) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.governance_has_authority_v1('moderator',auth.uid()) then
    raise exception 'governance_moderator_required' using errcode='42501';
  end if;
  if p_domain='distribution' then
    v_result:=public.distribution_trust_governance_explain_v1(p_subject_id);
  elsif p_domain='account_trust' then
    select jsonb_build_object(
      'domain','account_trust','subject_id',s.user_id,'current_state',s.risk_level,
      'human_explanation','Account Trust summarizes versioned evidence across six independent dimensions; it is not enforcement.',
      'technical_explanation',jsonb_build_object(
        'trust_score',s.trust_score,'dimension_scores',s.dimension_scores,
        'reason_codes',s.reason_codes,'active_signal_count',s.active_signal_count),
      'policy_version',s.engine_version,
      'evidence_references',coalesce((select jsonb_agg(jsonb_build_object(
        'signal_key',sig.signal_key,'dimension',sig.dimension,'reason_code',sig.reason_code,
        'detector_version',sig.detector_version,'confidence',sig.confidence,'observed_at',sig.observed_at,
        'expires_at',sig.expires_at)) from public.account_trust_signals sig
        where sig.user_id=s.user_id and sig.status='active'),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(jsonb_build_object(
        'previous_score',h.previous_score,'trust_score',h.trust_score,
        'risk_level',h.risk_level,'reason_codes',h.reason_codes,'created_at',h.created_at)
        order by h.created_at desc,h.id desc) from public.account_trust_score_history h
        where h.user_id=s.user_id),'[]'::jsonb)
    ) into v_result from public.account_trust_scores s where s.user_id=p_subject_id;
  elsif p_domain in ('safety_case','review_trust') then
    select jsonb_build_object(
      'domain',p_domain,'subject_id',c.id,'current_state',c.case_status,
      'human_explanation',coalesce(c.explanation_public,
        'The case state reflects independent Safety and Integrity dimensions and remains subject to human authority.'),
      'technical_explanation',jsonb_build_object(
        'priority',c.priority,'final_action',c.final_action,'final_category',c.final_category,
        'decision_source',c.decision_source,'explanation_code',c.explanation_code),
      'policy_version',coalesce((select d.policy_snapshot->>'policy_version'
        from public.safety_decision_events d where d.case_id=c.id order by d.created_at desc limit 1),'canonical-safety'),
      'evidence_references',coalesce((select jsonb_agg(jsonb_build_object(
        'signal_type',sig.signal_type,'provider',sig.provider,'flagged',sig.flagged,
        'risk_level',sig.scores->>'risk_level','created_at',sig.created_at))
        from public.safety_signals sig where sig.case_id=c.id
          and (p_domain='safety_case' or sig.provider='backyrd_integrity')),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(jsonb_build_object(
        'action',d.action,'source',d.source,'reason_codes',d.reason_codes,
        'actor_user_id',d.actor_user_id,'created_at',d.created_at) order by d.created_at desc)
        from public.safety_decision_events d where d.case_id=c.id),'[]'::jsonb)
    ) into v_result from public.safety_cases c where c.id=p_subject_id;
  else
    raise exception 'governance_explain_domain_invalid' using errcode='22023';
  end if;
  if v_result is null then raise exception 'governance_explain_subject_not_found' using errcode='P0002'; end if;
  return v_result||jsonb_build_object('governance_version',public.governance_active_version_v1());
end;
$$;

create or replace function public.governance_platform_health_v1()
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;v_distribution jsonb;
begin
  if auth.role()<>'service_role'
     and (auth.uid() is null or not public.governance_has_authority_v1('moderator',auth.uid())) then
    raise exception 'governance_health_access_required' using errcode='42501';
  end if;
  v_distribution:=public.distribution_trust_governance_health_v1();
  select jsonb_build_object(
    'status',case
      when (select count(*) from public.governance_incidents where status not in ('resolved','closed') and severity_key='S4')>0 then 'critical'
      when (select count(*) from public.governance_escalations where status='open' and due_at<now())>0
        or coalesce((v_distribution->>'overdue_evaluations')::bigint,0)>0
        or (select count(*) from public.governance_break_glass_events where status='active' and expires_at<=now())>0 then 'degraded'
      else 'healthy' end,
    'failed_evaluations',jsonb_build_object(
      'safety_text',(select count(*) from public.safety_text_evaluation_jobs where status in ('failed','dead_letter')),
      'safety_image',(select count(*) from public.safety_image_evaluation_jobs where status in ('failed','dead_letter')),
      'distribution',coalesce((v_distribution->>'failed_evaluations')::bigint,0)
    ),
    'stuck_queues',jsonb_build_object(
      'safety_text',(select count(*) from public.safety_text_evaluation_jobs where status='processing' and locked_at<now()-interval '10 minutes'),
      'safety_image',(select count(*) from public.safety_image_evaluation_jobs where status='processing' and locked_at<now()-interval '10 minutes'),
      'distribution',coalesce((v_distribution->>'overdue_evaluations')::bigint,0)
    ),
    'stale_trust_states',(select count(*) from public.account_trust_scores s where exists(
      select 1 from public.account_trust_signals sig where sig.user_id=s.user_id and sig.updated_at>s.updated_at)),
    'stale_distribution_states',coalesce((v_distribution->>'due_evaluations')::bigint,0),
    'orphan_overrides',coalesce((v_distribution->>'orphan_overrides')::bigint,0),
    'missing_restorations',coalesce((v_distribution->>'missing_restorations')::bigint,0),
    'evaluation_latency_ms',jsonb_build_object(
      'safety_text_p95',(select coalesce(percentile_cont(0.95) within group(order by extract(epoch from(completed_at-created_at))*1000),0)
        from public.safety_text_evaluation_jobs where completed_at is not null and completed_at>=now()-interval '24 hours'),
      'safety_image_p95',(select coalesce(percentile_cont(0.95) within group(order by extract(epoch from(completed_at-created_at))*1000),0)
        from public.safety_image_evaluation_jobs where completed_at is not null and completed_at>=now()-interval '24 hours')
    ),
    'open_incidents',(select count(*) from public.governance_incidents where status not in ('resolved','closed')),
    'critical_incidents',(select count(*) from public.governance_incidents where status not in ('resolved','closed') and severity_key='S4'),
    'open_escalations',(select count(*) from public.governance_escalations where status='open'),
    'overdue_escalations',(select count(*) from public.governance_escalations where status='open' and due_at<now()),
    'active_break_glass',(select count(*) from public.governance_break_glass_events where status='active' and expires_at>now()),
    'expired_break_glass_pending_audit',(select count(*) from public.governance_break_glass_events where status='active' and expires_at<=now()),
    'controls',(select jsonb_object_agg(control_key,jsonb_build_object(
      'stored_mode',current_mode,'effective_mode',public.governance_effective_control_mode_v1(control_key),
      'fail_strategy',fail_strategy)) from public.governance_system_controls),
    'governance_version',public.governance_active_version_v1(),
    'calculated_at',now(),
    'privacy','Aggregated operational metadata only; no private Trust evidence or personal information.'
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.governance_founder_overview_v1()
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if auth.uid() is null or not public.governance_has_authority_v1('trust_admin',auth.uid()) then
    raise exception 'governance_trust_admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'platform_health',public.governance_platform_health_v1(),
    'open_incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.severity_rank desc,x.started_at desc)
      from (select i.id,i.incident_key,i.status,i.severity_key,s.severity_rank,i.summary,
        i.affected_systems,i.started_at,i.owner_user_id
        from public.governance_incidents i join public.governance_severity_registry s using(severity_key)
        where i.status not in ('resolved','closed') order by s.severity_rank desc,i.started_at desc limit 10) x),'[]'::jsonb),
    'critical_alerts',(select count(*) from public.governance_incidents where status not in ('resolved','closed') and severity_key='S4'),
    'break_glass',(select jsonb_build_object(
      'active_count',count(*) filter(where b.status='active' and b.expires_at>now()),
      'controls',coalesce(jsonb_agg(jsonb_build_object('control_key',b.control_key,
        'mode',b.requested_mode,'expires_at',b.expires_at,'incident_id',b.incident_id)
        order by b.expires_at) filter(where b.status='active' and b.expires_at>now()),'[]'::jsonb))
      from public.governance_break_glass_events b),
    'current_escalations',coalesce((select jsonb_agg(to_jsonb(e) order by e.due_at)
      from public.governance_escalations e where e.status in ('open','acknowledged')),'[]'::jsonb),
    'recent_postmortems',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'incident_id',p.incident_id,'summary',p.summary,'published_at',p.published_at)
      order by p.published_at desc) from (select * from public.governance_postmortems
        where status='published' order by published_at desc limit 5) p),'[]'::jsonb),
    'calculated_at',now()
  );
end;
$$;

create or replace function public.founder_trust_health_v1()
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'open_cases',(select count(*) from public.safety_cases
      where case_status in ('queued','evaluating','needs_review','appealed','failed')),
    'needs_human_review',(select count(*) from public.safety_cases
      where case_status in ('needs_review','appealed')),
    'failed_cases',(select count(*) from public.safety_cases where case_status='failed'),
    'distribution',public.founder_distribution_health_v1(),
    'governance',public.governance_founder_overview_v1(),
    'calculated_at',now(),
    'interpretation','Signals, cases, Distribution states and incidents are operational indicators, never proof.'
  );
end;
$$;

revoke all on table public.governance_system_controls,public.governance_break_glass_events from anon,authenticated;
grant all on table public.governance_system_controls,public.governance_break_glass_events to service_role;

revoke all on function public.governance_effective_control_mode_v1(text) from public,anon,authenticated;
grant execute on function public.governance_effective_control_mode_v1(text) to service_role;
revoke all on function public.account_trust_evaluate_identity_due_uncontrolled_v1(integer,timestamptz),
  public.account_trust_evaluate_behaviour_due_uncontrolled_v1(integer,timestamptz),
  public.account_trust_evaluate_network_due_uncontrolled_v1(integer,timestamptz),
  public.account_trust_evaluate_security_due_uncontrolled_v1(integer,timestamptz),
  public.account_trust_evaluate_owner_due_uncontrolled_v1(integer,timestamptz),
  public.account_trust_evaluate_reputation_due_uncontrolled_v1(integer,timestamptz),
  public.safety_claim_text_jobs_uncontrolled_v1(text,integer),
  public.safety_claim_image_jobs_uncontrolled_v1(text,integer)
from public,anon,authenticated,service_role;
revoke all on function public.account_trust_evaluate_identity_due_v1(integer,timestamptz),
  public.account_trust_evaluate_behaviour_due_v1(integer,timestamptz),
  public.account_trust_evaluate_network_due_v1(integer,timestamptz),
  public.account_trust_evaluate_security_due_v1(integer,timestamptz),
  public.account_trust_evaluate_owner_due_v1(integer,timestamptz),
  public.account_trust_evaluate_reputation_due_v1(integer,timestamptz),
  public.safety_claim_text_jobs_v1(text,integer),
  public.safety_claim_image_jobs_v1(text,integer)
from public,anon,authenticated;
grant execute on function public.account_trust_evaluate_identity_due_v1(integer,timestamptz),
  public.account_trust_evaluate_behaviour_due_v1(integer,timestamptz),
  public.account_trust_evaluate_network_due_v1(integer,timestamptz),
  public.account_trust_evaluate_security_due_v1(integer,timestamptz),
  public.account_trust_evaluate_owner_due_v1(integer,timestamptz),
  public.account_trust_evaluate_reputation_due_v1(integer,timestamptz),
  public.safety_claim_text_jobs_v1(text,integer),
  public.safety_claim_image_jobs_v1(text,integer)
to service_role;
revoke all on function public.governance_activate_break_glass_v1(text,text,uuid,text,timestamptz) from public,anon;
grant execute on function public.governance_activate_break_glass_v1(text,text,uuid,text,timestamptz) to authenticated,service_role;
revoke all on function public.governance_release_break_glass_v1(text,text) from public,anon;
grant execute on function public.governance_release_break_glass_v1(text,text) to authenticated,service_role;
revoke all on function public.governance_expire_break_glass_v1(timestamptz) from public,anon,authenticated;
grant execute on function public.governance_expire_break_glass_v1(timestamptz) to service_role;
revoke all on function public.governance_capture_distribution_override_v1() from public,anon,authenticated;
revoke all on function public.governance_capture_safety_decision_v1() from public,anon,authenticated;
revoke all on function public.governance_capture_appeal_v1() from public,anon,authenticated;
revoke all on function public.distribution_trust_governance_explain_v1(uuid) from public,anon,authenticated;
grant execute on function public.distribution_trust_governance_explain_v1(uuid) to service_role;
revoke all on function public.distribution_trust_governance_health_v1() from public,anon,authenticated;
grant execute on function public.distribution_trust_governance_health_v1() to service_role;
revoke all on function public.governance_decision_explain_v1(text,uuid) from public,anon;
grant execute on function public.governance_decision_explain_v1(text,uuid) to authenticated,service_role;
revoke all on function public.governance_platform_health_v1() from public,anon;
grant execute on function public.governance_platform_health_v1() to authenticated,service_role;
revoke all on function public.governance_founder_overview_v1() from public,anon;
grant execute on function public.governance_founder_overview_v1() to authenticated,service_role;
revoke all on function public.distribution_trust_evaluate_due_v1(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.distribution_trust_evaluate_due_v1(integer,timestamptz) to service_role;

comment on table public.governance_break_glass_events is
  'Bounded reversible emergency controls. Break Glass never edits Trust evidence, policy or source content.';
comment on function public.governance_decision_explain_v1(text,uuid) is
  'Authorized structured explainability for Safety, Review Trust, Account Trust and Distribution decisions; raw private evidence is excluded.';
comment on function public.governance_platform_health_v1() is
  'Aggregated operational health for Trust governance and Founder oversight without personal data.';
