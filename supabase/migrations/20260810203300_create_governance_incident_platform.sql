-- Sprint 11: canonical Governance and Incident Response foundation.
--
-- Governance supervises Trust. It does not create Trust signals, calculate
-- Trust, moderate content, enforce outcomes or alter Distribution policy.

create table public.governance_versions (
  version text primary key check (version ~ '^[a-z][a-z0-9_.-]*$'),
  status text not null check (status in ('draft','active','retired')),
  severity_model jsonb not null check (jsonb_typeof(severity_model)='object'),
  incident_model jsonb not null check (jsonb_typeof(incident_model)='object'),
  escalation_model jsonb not null check (jsonb_typeof(escalation_model)='object'),
  break_glass_model jsonb not null check (jsonb_typeof(break_glass_model)='object'),
  retention_model jsonb not null check (jsonb_typeof(retention_model)='object'),
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

create unique index governance_versions_one_active_idx
  on public.governance_versions((status)) where status='active';

create table public.governance_severity_registry (
  severity_key text primary key check (severity_key in ('S0','S1','S2','S3','S4')),
  severity_rank integer not null unique check (severity_rank between 0 and 4),
  label text not null,
  description text not null,
  response_target_minutes integer check (response_target_minutes is null or response_target_minutes>0),
  requires_second_reviewer boolean not null default false,
  requires_founder_attention boolean not null default false,
  requires_postmortem boolean not null default false,
  model_version text not null references public.governance_versions(version),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.governance_role_registry (
  role_key text primary key check (role_key in ('moderator','senior_moderator','trust_admin','founder','system')),
  authority_rank integer not null unique check (authority_rank>0),
  responsibilities text[] not null,
  authority_boundaries text[] not null,
  may_manage_roles boolean not null default false,
  may_use_break_glass boolean not null default false,
  assignable_to_user boolean not null default true,
  model_version text not null references public.governance_versions(version),
  created_at timestamptz not null default now()
);

create table public.governance_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.governance_role_registry(role_key),
  status text not null default 'active' check (status in ('active','revoked')),
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_reason text not null check (length(btrim(granted_reason)) between 10 and 1000),
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_reason text check (revoked_reason is null or length(btrim(revoked_reason)) between 10 and 1000),
  revoked_at timestamptz,
  governance_version text not null references public.governance_versions(version),
  check (
    (status='active' and revoked_by is null and revoked_reason is null and revoked_at is null)
    or (status='revoked' and revoked_by is not null and revoked_reason is not null and revoked_at is not null)
  )
);

create unique index governance_role_assignments_one_active_idx
  on public.governance_role_assignments(user_id) where status='active';

create table public.governance_escalation_rules (
  rule_key text primary key,
  severity_key text not null references public.governance_severity_registry(severity_key),
  required_role text not null references public.governance_role_registry(role_key),
  response_target_minutes integer not null check (response_target_minutes>0),
  requires_second_reviewer boolean not null default false,
  requires_founder_attention boolean not null default false,
  rule_version integer not null default 1 check (rule_version>0),
  governance_version text not null references public.governance_versions(version),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.governance_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique check (incident_key ~ '^INC-[0-9]{8}-[A-Z0-9]{6}$'),
  status text not null default 'detected' check (status in (
    'detected','investigating','contained','monitoring','resolved','closed'
  )),
  severity_key text not null references public.governance_severity_registry(severity_key),
  summary text not null check (length(btrim(summary)) between 10 and 500),
  affected_systems text[] not null check (cardinality(affected_systems)>0),
  owner_user_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  root_cause text check (root_cause is null or length(btrim(root_cause)) between 10 and 4000),
  resolution text check (resolution is null or length(btrim(resolution)) between 10 and 4000),
  follow_up_summary text check (follow_up_summary is null or length(btrim(follow_up_summary)) between 10 and 4000),
  governance_version text not null references public.governance_versions(version),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at>=started_at),
  check (
    status not in ('resolved','closed')
    or (ended_at is not null and root_cause is not null and resolution is not null)
  )
);

create index governance_incidents_status_severity_idx
  on public.governance_incidents(status,severity_key,started_at desc);
create index governance_incidents_owner_idx
  on public.governance_incidents(owner_user_id,status) where owner_user_id is not null;

create table public.governance_incident_users (
  incident_id uuid not null references public.governance_incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(incident_id,user_id)
);

create table public.governance_incident_spots (
  incident_id uuid not null references public.governance_incidents(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(incident_id,spot_id)
);

create table public.governance_incident_links (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.governance_incidents(id) on delete cascade,
  link_type text not null check (link_type in (
    'safety_case','appeal','distribution_override','account_trust_event','review_integrity_event','external_runbook'
  )),
  reference_id text not null check (length(reference_id) between 1 and 500),
  public_summary text not null check (length(btrim(public_summary)) between 5 and 500),
  added_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(incident_id,link_type,reference_id)
);

create table public.governance_incident_timeline (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.governance_incidents(id) on delete cascade,
  entry_type text not null check (entry_type in (
    'detected','status_changed','severity_changed','assigned','observation','mitigation','restoration','review','postmortem'
  )),
  summary text not null check (length(btrim(summary)) between 5 and 2000),
  occurred_at timestamptz not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('human','system')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  check ((source='human' and actor_user_id is not null) or source='system')
);

create index governance_incident_timeline_incident_idx
  on public.governance_incident_timeline(incident_id,occurred_at,id);

create table public.governance_incident_reviews (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.governance_incidents(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  review_outcome text not null check (review_outcome in ('concur','needs_more_work','escalate')),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  governance_version text not null references public.governance_versions(version),
  created_at timestamptz not null default now(),
  unique(incident_id,reviewer_user_id)
);

create table public.governance_escalations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.governance_incidents(id) on delete cascade,
  rule_key text not null references public.governance_escalation_rules(rule_key),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  required_role text not null references public.governance_role_registry(role_key),
  reason text not null,
  due_at timestamptz not null,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status='open' and acknowledged_by is null and acknowledged_at is null and resolved_at is null)
    or (status='acknowledged' and acknowledged_by is not null and acknowledged_at is not null and resolved_at is null)
    or (status='resolved' and acknowledged_by is not null and acknowledged_at is not null and resolved_at is not null)
  )
);

create unique index governance_escalations_one_active_rule_idx
  on public.governance_escalations(incident_id,rule_key) where status in ('open','acknowledged');
create index governance_escalations_due_idx
  on public.governance_escalations(status,due_at);

create table public.governance_postmortems (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null unique references public.governance_incidents(id) on delete restrict,
  status text not null default 'published' check (status in ('published','superseded')),
  summary text not null check (length(btrim(summary)) between 20 and 4000),
  timeline_summary text not null check (length(btrim(timeline_summary)) between 20 and 8000),
  root_cause text not null check (length(btrim(root_cause)) between 20 and 8000),
  affected_systems text[] not null check (cardinality(affected_systems)>0),
  impact text not null check (length(btrim(impact)) between 20 and 8000),
  what_worked text not null check (length(btrim(what_worked)) between 10 and 8000),
  what_failed text not null check (length(btrim(what_failed)) between 10 and 8000),
  preventive_actions jsonb not null check (jsonb_typeof(preventive_actions)='array'),
  governance_version text not null references public.governance_versions(version),
  authored_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (authored_by<>reviewed_by)
);

create table public.governance_retention_policies (
  record_class text primary key check (record_class in (
    'incident','incident_timeline','governance_audit','postmortem','evidence_reference','appeal_reference','override_reference'
  )),
  retention_days integer check (retention_days is null or retention_days>=30),
  disposition text not null check (disposition in ('retain','review_then_redact','source_system_controlled')),
  rationale text not null,
  policy_version integer not null default 1 check (policy_version>0),
  governance_version text not null references public.governance_versions(version),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.governance_audit_events (
  id bigint generated always as identity primary key,
  event_key text not null,
  incident_id uuid references public.governance_incidents(id) on delete restrict,
  object_type text not null,
  object_id text not null,
  action text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('human','system')),
  reason text not null check (length(btrim(reason)) between 5 and 2000),
  old_value jsonb,
  new_value jsonb,
  governance_version text not null references public.governance_versions(version),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(event_key),
  check ((source='human' and actor_user_id is not null) or source='system')
);

create index governance_audit_events_incident_idx
  on public.governance_audit_events(incident_id,created_at,id) where incident_id is not null;
create index governance_audit_events_object_idx
  on public.governance_audit_events(object_type,object_id,created_at,id);

insert into public.governance_versions(
  version,status,severity_model,incident_model,escalation_model,break_glass_model,
  retention_model,description,activated_at
) values(
  'governance-v1','active',
  '{"levels":["S0","S1","S2","S3","S4"],"independent_from_distribution":true}'::jsonb,
  '{"statuses":["detected","investigating","contained","monitoring","resolved","closed"],"auditable":true}'::jsonb,
  '{"S3":{"second_reviewer":true},"S4":{"second_reviewer":true,"founder_attention":true}}'::jsonb,
  '{"reason_required":true,"actor_required":true,"reversible":true,"time_bounded":true}'::jsonb,
  '{"audit_days":2555,"incident_days":2555,"evidence_days":365,"legal_holds_respected":true}'::jsonb,
  'Sprint 11 canonical Governance and Incident Response contract.',now()
);

insert into public.governance_severity_registry(
  severity_key,severity_rank,label,description,response_target_minutes,
  requires_second_reviewer,requires_founder_attention,requires_postmortem,model_version
) values
  ('S0',0,'Information','Operational information with no current user impact.',null,false,false,false,'governance-v1'),
  ('S1',1,'Low','Limited issue with negligible or localized impact.',1440,false,false,false,'governance-v1'),
  ('S2',2,'Medium','Material degradation requiring accountable operational ownership.',240,false,false,false,'governance-v1'),
  ('S3',3,'High','Serious Trust or platform risk requiring independent review.',60,true,false,true,'governance-v1'),
  ('S4',4,'Critical','Critical platform risk requiring immediate Founder oversight.',15,true,true,true,'governance-v1');

insert into public.governance_role_registry(
  role_key,authority_rank,responsibilities,authority_boundaries,
  may_manage_roles,may_use_break_glass,assignable_to_user,model_version
) values
  ('moderator',10,array['triage incidents','add timeline observations'],array['cannot close major incidents','cannot use break glass'],false,false,true,'governance-v1'),
  ('senior_moderator',20,array['own incidents','perform second review'],array['cannot manage roles','cannot use break glass'],false,false,true,'governance-v1'),
  ('trust_admin',30,array['manage major incidents','publish postmortems','use bounded break glass'],array['cannot grant Founder authority'],false,true,true,'governance-v1'),
  ('founder',40,array['critical oversight','manage governance roles','use all break glass controls'],array['all actions remain audited and reversible'],true,true,true,'governance-v1'),
  ('system',50,array['record automated operational events'],array['cannot make human decisions','cannot hold a user assignment'],false,false,false,'governance-v1');

insert into public.governance_escalation_rules(
  rule_key,severity_key,required_role,response_target_minutes,
  requires_second_reviewer,requires_founder_attention,governance_version
) values
  ('severity_s2_owner','S2','senior_moderator',240,false,false,'governance-v1'),
  ('severity_s3_independent_review','S3','trust_admin',60,true,false,'governance-v1'),
  ('severity_s4_founder_attention','S4','founder',15,true,true,'governance-v1');

insert into public.governance_retention_policies(
  record_class,retention_days,disposition,rationale,governance_version
) values
  ('incident',2555,'retain','Seven years supports accountability, trend analysis and legal review without retaining raw evidence indefinitely.','governance-v1'),
  ('incident_timeline',2555,'retain','Incident chronology is part of the durable operational record.','governance-v1'),
  ('governance_audit',2555,'retain','Consequential governance actions require a durable immutable record.','governance-v1'),
  ('postmortem',2555,'retain','Postmortems preserve institutional learning and preventive commitments.','governance-v1'),
  ('evidence_reference',365,'review_then_redact','Evidence references are minimized and reviewed after one year; source data follows its own policy.','governance-v1'),
  ('appeal_reference',null,'source_system_controlled','Appeal data remains governed by the canonical Safety and legal retention policy.','governance-v1'),
  ('override_reference',null,'source_system_controlled','Override source records remain governed by Distribution Trust retention.','governance-v1');

-- Existing technical Admin roles receive a deterministic governance mapping.
insert into public.governance_role_assignments(
  user_id,role_key,status,granted_by,granted_reason,governance_version
)
select a.user_id,
  case a.role when 'super_admin' then 'founder' when 'admin' then 'trust_admin' else 'moderator' end,
  'active',a.user_id,'Migrated from the canonical existing Admin authority registry.','governance-v1'
from public.admin_users a
join public.profiles p on p.id=a.user_id
on conflict do nothing;

create or replace function public.governance_active_version_v1()
returns text language sql stable security definer set search_path=public,pg_catalog as $$
  select version from public.governance_versions where status='active';
$$;

create or replace function public.governance_current_role_v1(p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path=public,pg_catalog as $$
  select coalesce(
    (select role_key from public.governance_role_assignments
      where user_id=p_user_id and status='active' order by granted_at desc limit 1),
    (select case role when 'super_admin' then 'founder' when 'admin' then 'trust_admin' else 'moderator' end
      from public.admin_users where user_id=p_user_id limit 1),
    (select 'trust_admin' from public.profiles where id=p_user_id and is_admin=true),
    null
  );
$$;

create or replace function public.governance_has_authority_v1(
  p_required_role text,p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
  select coalesce(
    (select actual.authority_rank>=required.authority_rank
      from public.governance_role_registry actual
      join public.governance_role_registry required on required.role_key=p_required_role
      where actual.role_key=public.governance_current_role_v1(p_user_id)),false
  );
$$;

create or replace function public.governance_write_audit_v1(
  p_event_key text,p_incident_id uuid,p_object_type text,p_object_id text,p_action text,
  p_actor_user_id uuid,p_source text,p_reason text,p_old_value jsonb default null,
  p_new_value jsonb default null,p_metadata jsonb default '{}'::jsonb
) returns bigint language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id bigint;v_version text:=public.governance_active_version_v1();
begin
  if nullif(btrim(coalesce(p_event_key,'')),'') is null
     or nullif(btrim(coalesce(p_object_type,'')),'') is null
     or nullif(btrim(coalesce(p_object_id,'')),'') is null
     or nullif(btrim(coalesce(p_action,'')),'') is null then
    raise exception 'governance_audit_identity_required' using errcode='22023';
  end if;
  insert into public.governance_audit_events(
    event_key,incident_id,object_type,object_id,action,actor_user_id,source,reason,
    old_value,new_value,governance_version,metadata
  ) values(
    btrim(p_event_key),p_incident_id,btrim(p_object_type),btrim(p_object_id),btrim(p_action),
    p_actor_user_id,p_source,btrim(p_reason),p_old_value,p_new_value,v_version,coalesce(p_metadata,'{}'::jsonb)
  ) on conflict(event_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.governance_audit_events where event_key=btrim(p_event_key);
  end if;
  return v_id;
end;
$$;

create or replace function public.governance_reject_mutation_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  raise exception 'governance_append_only_record' using errcode='55000';
end;
$$;

create trigger trg_governance_audit_immutable
before update or delete on public.governance_audit_events
for each row execute function public.governance_reject_mutation_v1();
create trigger trg_governance_timeline_immutable
before update or delete on public.governance_incident_timeline
for each row execute function public.governance_reject_mutation_v1();
create trigger trg_governance_reviews_immutable
before update or delete on public.governance_incident_reviews
for each row execute function public.governance_reject_mutation_v1();
create trigger trg_governance_postmortems_immutable
before update or delete on public.governance_postmortems
for each row execute function public.governance_reject_mutation_v1();

create or replace function public.governance_create_escalation_v1(
  p_incident_id uuid,p_severity_key text,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_rule public.governance_escalation_rules%rowtype;v_id uuid;
begin
  select * into v_rule from public.governance_escalation_rules
  where severity_key=p_severity_key and enabled order by response_target_minutes limit 1;
  if v_rule.rule_key is null then return null; end if;
  insert into public.governance_escalations(
    incident_id,rule_key,required_role,reason,due_at
  ) values(
    p_incident_id,v_rule.rule_key,v_rule.required_role,btrim(p_reason),
    now()+make_interval(mins=>v_rule.response_target_minutes)
  ) on conflict do nothing returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.governance_create_incident_v1(
  p_severity_key text,p_summary text,p_affected_systems text[],p_started_at timestamptz default now(),
  p_owner_user_id uuid default null,p_affected_user_ids uuid[] default '{}'::uuid[],
  p_affected_spot_ids uuid[] default '{}'::uuid[]
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_role text;v_incident_id uuid:=gen_random_uuid();
  v_key text;v_version text:=public.governance_active_version_v1();v_severity_rank integer;
begin
  if v_actor is null or not public.governance_has_authority_v1('senior_moderator',v_actor) then
    raise exception 'governance_senior_moderator_required' using errcode='42501';
  end if;
  select severity_rank into v_severity_rank from public.governance_severity_registry
    where severity_key=p_severity_key and enabled;
  if v_severity_rank is null then raise exception 'governance_severity_invalid' using errcode='22023'; end if;
  if v_severity_rank>=3 and not public.governance_has_authority_v1('trust_admin',v_actor) then
    raise exception 'governance_major_incident_admin_required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_summary,''))) not between 10 and 500
     or coalesce(cardinality(p_affected_systems),0)=0 then
    raise exception 'governance_incident_contract_invalid' using errcode='22023';
  end if;
  v_key:='INC-'||to_char(coalesce(p_started_at,now()) at time zone 'UTC','YYYYMMDD')||'-'||upper(substr(replace(v_incident_id::text,'-',''),1,6));
  insert into public.governance_incidents(
    id,incident_key,severity_key,summary,affected_systems,owner_user_id,started_at,
    governance_version,created_by
  ) values(
    v_incident_id,v_key,p_severity_key,btrim(p_summary),p_affected_systems,
    coalesce(p_owner_user_id,v_actor),coalesce(p_started_at,now()),v_version,v_actor
  );
  insert into public.governance_incident_users(incident_id,user_id)
    select v_incident_id,x from unnest(coalesce(p_affected_user_ids,'{}'::uuid[])) x on conflict do nothing;
  insert into public.governance_incident_spots(incident_id,spot_id)
    select v_incident_id,x from unnest(coalesce(p_affected_spot_ids,'{}'::uuid[])) x on conflict do nothing;
  insert into public.governance_incident_timeline(
    incident_id,entry_type,summary,occurred_at,actor_user_id,source
  ) values(v_incident_id,'detected',btrim(p_summary),coalesce(p_started_at,now()),v_actor,'human');
  perform public.governance_create_escalation_v1(v_incident_id,p_severity_key,'Incident severity requires canonical escalation.');
  perform public.governance_write_audit_v1(
    'incident_created:'||v_incident_id,v_incident_id,'incident',v_incident_id::text,'created',
    v_actor,'human','Incident created with accountable owner.',null,
    jsonb_build_object('status','detected','severity',p_severity_key,'affected_systems',p_affected_systems)
  );
  return jsonb_build_object('incident_id',v_incident_id,'incident_key',v_key,'status','detected','severity',p_severity_key);
end;
$$;

create or replace function public.governance_add_timeline_v1(
  p_incident_id uuid,p_entry_type text,p_summary text,p_occurred_at timestamptz default now()
) returns bigint language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_id bigint;
begin
  if v_actor is null or not public.governance_has_authority_v1('moderator',v_actor) then
    raise exception 'governance_moderator_required' using errcode='42501';
  end if;
  insert into public.governance_incident_timeline(
    incident_id,entry_type,summary,occurred_at,actor_user_id,source
  ) values(p_incident_id,p_entry_type,btrim(p_summary),coalesce(p_occurred_at,now()),v_actor,'human')
  returning id into v_id;
  perform public.governance_write_audit_v1(
    'incident_timeline:'||v_id,p_incident_id,'incident_timeline',v_id::text,'appended',v_actor,
    'human','Incident timeline entry appended.',null,jsonb_build_object('entry_type',p_entry_type)
  );
  return v_id;
end;
$$;

create or replace function public.governance_assign_incident_v1(
  p_incident_id uuid,p_owner_user_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_old_owner uuid;
begin
  if v_actor is null or not public.governance_has_authority_v1('senior_moderator',v_actor) then
    raise exception 'governance_senior_moderator_required' using errcode='42501';
  end if;
  if not public.governance_has_authority_v1('moderator',p_owner_user_id) then
    raise exception 'governance_incident_owner_role_required' using errcode='42501';
  end if;
  select owner_user_id into v_old_owner from public.governance_incidents where id=p_incident_id for update;
  if not found then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  if v_old_owner=p_owner_user_id then
    return jsonb_build_object('incident_id',p_incident_id,'owner_user_id',p_owner_user_id,'duplicate',true);
  end if;
  update public.governance_incidents set owner_user_id=p_owner_user_id,updated_at=now() where id=p_incident_id;
  insert into public.governance_incident_timeline(
    incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata
  ) values(p_incident_id,'assigned',btrim(p_reason),now(),v_actor,'human',
    jsonb_build_object('old_owner',v_old_owner,'new_owner',p_owner_user_id));
  perform public.governance_write_audit_v1(
    'incident_assignment:'||p_incident_id||':'||p_owner_user_id,p_incident_id,'incident',p_incident_id::text,
    'assigned',v_actor,'human',btrim(p_reason),jsonb_build_object('owner_user_id',v_old_owner),
    jsonb_build_object('owner_user_id',p_owner_user_id)
  );
  return jsonb_build_object('incident_id',p_incident_id,'owner_user_id',p_owner_user_id,'duplicate',false);
end;
$$;

create or replace function public.governance_link_incident_v1(
  p_incident_id uuid,p_link_type text,p_reference_id text,p_public_summary text
) returns bigint language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_id bigint;
begin
  if v_actor is null or not public.governance_has_authority_v1('moderator',v_actor) then
    raise exception 'governance_moderator_required' using errcode='42501';
  end if;
  insert into public.governance_incident_links(
    incident_id,link_type,reference_id,public_summary,added_by
  ) values(p_incident_id,p_link_type,btrim(p_reference_id),btrim(p_public_summary),v_actor)
  on conflict(incident_id,link_type,reference_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.governance_incident_links
      where incident_id=p_incident_id and link_type=p_link_type and reference_id=btrim(p_reference_id);
  else
    perform public.governance_write_audit_v1(
      'incident_link:'||v_id,p_incident_id,'incident_link',v_id::text,'linked',v_actor,'human',
      'Governance reference linked without copying private source evidence.',null,
      jsonb_build_object('link_type',p_link_type,'reference_id',btrim(p_reference_id))
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.governance_change_severity_v1(
  p_incident_id uuid,p_new_severity text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_old text;v_old_rank integer;v_new_rank integer;
begin
  if v_actor is null or not public.governance_has_authority_v1('trust_admin',v_actor) then
    raise exception 'governance_trust_admin_required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
    raise exception 'governance_reason_required' using errcode='22023';
  end if;
  select severity_key into v_old from public.governance_incidents where id=p_incident_id for update;
  if v_old is null then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  select severity_rank into v_old_rank from public.governance_severity_registry where severity_key=v_old;
  select severity_rank into v_new_rank from public.governance_severity_registry where severity_key=p_new_severity and enabled;
  if v_new_rank is null then raise exception 'governance_severity_invalid' using errcode='22023'; end if;
  if v_old=p_new_severity then return jsonb_build_object('incident_id',p_incident_id,'severity',v_old,'duplicate',true); end if;
  update public.governance_incidents set severity_key=p_new_severity,updated_at=now() where id=p_incident_id;
  insert into public.governance_incident_timeline(incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata)
  values(p_incident_id,'severity_changed',btrim(p_reason),now(),v_actor,'human',jsonb_build_object('old',v_old,'new',p_new_severity));
  if v_new_rank>=2 then perform public.governance_create_escalation_v1(p_incident_id,p_new_severity,btrim(p_reason)); end if;
  perform public.governance_write_audit_v1(
    'incident_severity:'||p_incident_id||':'||extract(epoch from clock_timestamp())::bigint,
    p_incident_id,'incident',p_incident_id::text,'severity_changed',v_actor,'human',btrim(p_reason),
    jsonb_build_object('severity',v_old),jsonb_build_object('severity',p_new_severity)
  );
  return jsonb_build_object('incident_id',p_incident_id,'severity',p_new_severity,'duplicate',false);
end;
$$;

create or replace function public.governance_review_incident_v1(
  p_incident_id uuid,p_outcome text,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_creator uuid;v_id uuid;v_version text:=public.governance_active_version_v1();
begin
  if v_actor is null or not public.governance_has_authority_v1('senior_moderator',v_actor) then
    raise exception 'governance_senior_moderator_required' using errcode='42501';
  end if;
  select created_by into v_creator from public.governance_incidents where id=p_incident_id;
  if v_creator is null then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  if v_creator=v_actor then raise exception 'governance_independent_reviewer_required' using errcode='42501'; end if;
  insert into public.governance_incident_reviews(
    incident_id,reviewer_user_id,review_outcome,reason,governance_version
  ) values(p_incident_id,v_actor,p_outcome,btrim(p_reason),v_version) returning id into v_id;
  insert into public.governance_incident_timeline(incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata)
  values(p_incident_id,'review',btrim(p_reason),now(),v_actor,'human',jsonb_build_object('outcome',p_outcome));
  perform public.governance_write_audit_v1(
    'incident_review:'||v_id,p_incident_id,'incident_review',v_id::text,'recorded',v_actor,'human',
    btrim(p_reason),null,jsonb_build_object('outcome',p_outcome)
  );
  return v_id;
end;
$$;

create or replace function public.governance_set_incident_status_v1(
  p_incident_id uuid,p_new_status text,p_reason text,p_root_cause text default null,
  p_resolution text default null,p_follow_up text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_incident public.governance_incidents%rowtype;
  v_requires_review boolean;v_requires_postmortem boolean;v_allowed boolean:=false;
begin
  if v_actor is null or not public.governance_has_authority_v1('senior_moderator',v_actor) then
    raise exception 'governance_senior_moderator_required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
    raise exception 'governance_reason_required' using errcode='22023';
  end if;
  select * into v_incident from public.governance_incidents where id=p_incident_id for update;
  if v_incident.id is null then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  if v_incident.status=p_new_status then
    return jsonb_build_object('incident_id',p_incident_id,'status',p_new_status,'duplicate',true);
  end if;
  v_allowed:=case v_incident.status
    when 'detected' then p_new_status='investigating'
    when 'investigating' then p_new_status in ('contained','monitoring','resolved')
    when 'contained' then p_new_status in ('monitoring','resolved')
    when 'monitoring' then p_new_status='resolved'
    when 'resolved' then p_new_status='closed'
    else false end;
  if not v_allowed then raise exception 'governance_incident_transition_invalid' using errcode='22023'; end if;
  select requires_second_reviewer,requires_postmortem
    into v_requires_review,v_requires_postmortem
  from public.governance_severity_registry where severity_key=v_incident.severity_key;
  if p_new_status in ('resolved','closed') and v_requires_review
     and not exists(select 1 from public.governance_incident_reviews
       where incident_id=p_incident_id and review_outcome='concur') then
    raise exception 'governance_second_review_required' using errcode='42501';
  end if;
  if p_new_status='closed' and v_requires_postmortem
     and not exists(select 1 from public.governance_postmortems
       where incident_id=p_incident_id and status='published') then
    raise exception 'governance_postmortem_required' using errcode='23514';
  end if;
  if p_new_status in ('resolved','closed')
     and (length(btrim(coalesce(p_root_cause,v_incident.root_cause,'')))<10
       or length(btrim(coalesce(p_resolution,v_incident.resolution,'')))<10) then
    raise exception 'governance_resolution_detail_required' using errcode='22023';
  end if;
  update public.governance_incidents set
    status=p_new_status,
    root_cause=coalesce(nullif(btrim(p_root_cause),''),root_cause),
    resolution=coalesce(nullif(btrim(p_resolution),''),resolution),
    follow_up_summary=coalesce(nullif(btrim(p_follow_up),''),follow_up_summary),
    ended_at=case when p_new_status in ('resolved','closed') then coalesce(ended_at,now()) else ended_at end,
    updated_at=now()
  where id=p_incident_id;
  if p_new_status in ('resolved','closed') then
    update public.governance_escalations set status='resolved',resolved_at=now()
    where incident_id=p_incident_id and status='acknowledged';
  end if;
  insert into public.governance_incident_timeline(incident_id,entry_type,summary,occurred_at,actor_user_id,source,metadata)
  values(p_incident_id,'status_changed',btrim(p_reason),now(),v_actor,'human',
    jsonb_build_object('old',v_incident.status,'new',p_new_status));
  perform public.governance_write_audit_v1(
    'incident_status:'||p_incident_id||':'||p_new_status,p_incident_id,'incident',p_incident_id::text,
    'status_changed',v_actor,'human',btrim(p_reason),jsonb_build_object('status',v_incident.status),
    jsonb_build_object('status',p_new_status)
  );
  return jsonb_build_object('incident_id',p_incident_id,'status',p_new_status,'duplicate',false);
end;
$$;

create or replace function public.governance_acknowledge_escalation_v1(
  p_escalation_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_escalation public.governance_escalations%rowtype;
begin
  select * into v_escalation from public.governance_escalations where id=p_escalation_id for update;
  if v_escalation.id is null then raise exception 'governance_escalation_not_found' using errcode='P0002'; end if;
  if not public.governance_has_authority_v1(v_escalation.required_role,v_actor) then
    raise exception 'governance_escalation_authority_required' using errcode='42501';
  end if;
  if v_escalation.status<>'open' then
    return jsonb_build_object('escalation_id',p_escalation_id,'status',v_escalation.status,'duplicate',true);
  end if;
  update public.governance_escalations set status='acknowledged',acknowledged_by=v_actor,acknowledged_at=now()
  where id=p_escalation_id;
  perform public.governance_write_audit_v1(
    'escalation_ack:'||p_escalation_id,v_escalation.incident_id,'escalation',p_escalation_id::text,
    'acknowledged',v_actor,'human',btrim(p_reason),jsonb_build_object('status','open'),
    jsonb_build_object('status','acknowledged')
  );
  return jsonb_build_object('escalation_id',p_escalation_id,'status','acknowledged','duplicate',false);
end;
$$;

create or replace function public.governance_publish_postmortem_v1(
  p_incident_id uuid,p_summary text,p_timeline_summary text,p_root_cause text,
  p_impact text,p_what_worked text,p_what_failed text,p_preventive_actions jsonb,
  p_reviewer_user_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_incident public.governance_incidents%rowtype;v_id uuid;
  v_version text:=public.governance_active_version_v1();
begin
  if v_actor is null or not public.governance_has_authority_v1('trust_admin',v_actor) then
    raise exception 'governance_trust_admin_required' using errcode='42501';
  end if;
  if p_reviewer_user_id=v_actor or not public.governance_has_authority_v1('senior_moderator',p_reviewer_user_id) then
    raise exception 'governance_independent_postmortem_reviewer_required' using errcode='42501';
  end if;
  select * into v_incident from public.governance_incidents where id=p_incident_id;
  if v_incident.id is null then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  if v_incident.status not in ('resolved','closed') then
    raise exception 'governance_incident_must_be_resolved' using errcode='23514';
  end if;
  insert into public.governance_postmortems(
    incident_id,summary,timeline_summary,root_cause,affected_systems,impact,what_worked,
    what_failed,preventive_actions,governance_version,authored_by,reviewed_by
  ) values(
    p_incident_id,btrim(p_summary),btrim(p_timeline_summary),btrim(p_root_cause),
    v_incident.affected_systems,btrim(p_impact),btrim(p_what_worked),btrim(p_what_failed),
    p_preventive_actions,v_version,v_actor,p_reviewer_user_id
  ) returning id into v_id;
  insert into public.governance_incident_timeline(incident_id,entry_type,summary,occurred_at,actor_user_id,source)
  values(p_incident_id,'postmortem','Postmortem published with independent review.',now(),v_actor,'human');
  perform public.governance_write_audit_v1(
    'postmortem_published:'||v_id,p_incident_id,'postmortem',v_id::text,'published',v_actor,
    'human','Postmortem published with independent review.',null,
    jsonb_build_object('reviewed_by',p_reviewer_user_id)
  );
  return v_id;
end;
$$;

create or replace function public.governance_assign_role_v1(
  p_user_id uuid,p_role_key text,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_version text:=public.governance_active_version_v1();
begin
  if v_actor is null or not public.governance_has_authority_v1('founder',v_actor) then
    raise exception 'governance_founder_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.governance_role_registry where role_key=p_role_key and assignable_to_user) then
    raise exception 'governance_role_invalid' using errcode='22023';
  end if;
  update public.governance_role_assignments set status='revoked',revoked_by=v_actor,
    revoked_reason='Superseded by a new canonical Governance role assignment.',revoked_at=now()
  where user_id=p_user_id and status='active';
  insert into public.governance_role_assignments(
    user_id,role_key,granted_by,granted_reason,governance_version
  ) values(p_user_id,p_role_key,v_actor,btrim(p_reason),v_version) returning id into v_id;
  perform public.governance_write_audit_v1(
    'role_assignment:'||v_id,null,'governance_role_assignment',v_id::text,'granted',v_actor,
    'human',btrim(p_reason),null,jsonb_build_object('user_id',p_user_id,'role',p_role_key)
  );
  return v_id;
end;
$$;

create or replace function public.governance_revoke_role_v1(
  p_user_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_assignment public.governance_role_assignments%rowtype;
begin
  if v_actor is null or not public.governance_has_authority_v1('founder',v_actor) then
    raise exception 'governance_founder_required' using errcode='42501';
  end if;
  if p_user_id=v_actor then
    raise exception 'governance_self_role_revocation_forbidden' using errcode='42501';
  end if;
  select * into v_assignment from public.governance_role_assignments
    where user_id=p_user_id and status='active' for update;
  if v_assignment.id is null then
    return jsonb_build_object('user_id',p_user_id,'duplicate',true);
  end if;
  update public.governance_role_assignments set status='revoked',revoked_by=v_actor,
    revoked_reason=btrim(p_reason),revoked_at=now() where id=v_assignment.id;
  perform public.governance_write_audit_v1(
    'role_revoked:'||v_assignment.id,null,'governance_role_assignment',v_assignment.id::text,
    'revoked',v_actor,'human',btrim(p_reason),jsonb_build_object('role',v_assignment.role_key),null
  );
  return jsonb_build_object('user_id',p_user_id,'role',v_assignment.role_key,'duplicate',false);
end;
$$;

create or replace function public.governance_admin_overview_v1(
  p_status text default null,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.governance_has_authority_v1('moderator',auth.uid()) then
    raise exception 'governance_moderator_required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'governance_version',public.governance_active_version_v1(),
    'role',public.governance_current_role_v1(auth.uid()),
    'incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.severity_rank desc,x.started_at desc)
      from (select i.id,i.incident_key,i.status,i.severity_key,s.severity_rank,i.summary,
        i.affected_systems,i.owner_user_id,i.started_at,i.ended_at,
        (select count(*) from public.governance_incident_users u where u.incident_id=i.id) affected_user_count,
        (select count(*) from public.governance_incident_spots sp where sp.incident_id=i.id) affected_spot_count
        from public.governance_incidents i join public.governance_severity_registry s using(severity_key)
        where p_status is null or i.status=p_status
        order by s.severity_rank desc,i.started_at desc limit greatest(1,least(coalesce(p_limit,100),500))) x),'[]'::jsonb),
    'open_escalations',(select count(*) from public.governance_escalations where status='open'),
    'calculated_at',now()
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.governance_incident_detail_v1(p_incident_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.governance_has_authority_v1('moderator',auth.uid()) then
    raise exception 'governance_moderator_required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'incident',to_jsonb(i),
    'affected_user_count',(select count(*) from public.governance_incident_users where incident_id=i.id),
    'affected_spot_count',(select count(*) from public.governance_incident_spots where incident_id=i.id),
    'timeline',coalesce((select jsonb_agg(to_jsonb(t) order by occurred_at,id)
      from public.governance_incident_timeline t where t.incident_id=i.id),'[]'::jsonb),
    'escalations',coalesce((select jsonb_agg(to_jsonb(e) order by created_at)
      from public.governance_escalations e where e.incident_id=i.id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by created_at)
      from public.governance_incident_reviews r where r.incident_id=i.id),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(l) order by created_at)
      from public.governance_incident_links l where l.incident_id=i.id),'[]'::jsonb),
    'postmortem',(select to_jsonb(p) from public.governance_postmortems p where p.incident_id=i.id),
    'audit',coalesce((select jsonb_agg(to_jsonb(a) order by created_at,id)
      from public.governance_audit_events a where a.incident_id=i.id),'[]'::jsonb)
  ) into v_result from public.governance_incidents i where i.id=p_incident_id;
  if v_result is null then raise exception 'governance_incident_not_found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

-- Private Governance tables are available only through authorized RPCs.
alter table public.governance_versions enable row level security;
alter table public.governance_severity_registry enable row level security;
alter table public.governance_role_registry enable row level security;
alter table public.governance_role_assignments enable row level security;
alter table public.governance_escalation_rules enable row level security;
alter table public.governance_incidents enable row level security;
alter table public.governance_incident_users enable row level security;
alter table public.governance_incident_spots enable row level security;
alter table public.governance_incident_links enable row level security;
alter table public.governance_incident_timeline enable row level security;
alter table public.governance_incident_reviews enable row level security;
alter table public.governance_escalations enable row level security;
alter table public.governance_postmortems enable row level security;
alter table public.governance_retention_policies enable row level security;
alter table public.governance_audit_events enable row level security;

revoke all on table public.governance_versions,public.governance_severity_registry,
  public.governance_role_registry,public.governance_role_assignments,
  public.governance_escalation_rules,public.governance_incidents,
  public.governance_incident_users,public.governance_incident_spots,
  public.governance_incident_links,public.governance_incident_timeline,
  public.governance_incident_reviews,public.governance_escalations,
  public.governance_postmortems,public.governance_retention_policies,
  public.governance_audit_events from anon,authenticated;
grant all on table public.governance_versions,public.governance_severity_registry,
  public.governance_role_registry,public.governance_role_assignments,
  public.governance_escalation_rules,public.governance_incidents,
  public.governance_incident_users,public.governance_incident_spots,
  public.governance_incident_links,public.governance_incident_timeline,
  public.governance_incident_reviews,public.governance_escalations,
  public.governance_postmortems,public.governance_retention_policies,
  public.governance_audit_events to service_role;

revoke all on function public.governance_active_version_v1() from public,anon,authenticated;
revoke all on function public.governance_current_role_v1(uuid) from public,anon;
grant execute on function public.governance_current_role_v1(uuid) to authenticated,service_role;
revoke all on function public.governance_has_authority_v1(text,uuid) from public,anon;
grant execute on function public.governance_has_authority_v1(text,uuid) to authenticated,service_role;
revoke all on function public.governance_write_audit_v1(text,uuid,text,text,text,uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.governance_write_audit_v1(text,uuid,text,text,text,uuid,text,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.governance_reject_mutation_v1() from public,anon,authenticated;
revoke all on function public.governance_create_escalation_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.governance_create_escalation_v1(uuid,text,text) to service_role;

revoke all on function public.governance_create_incident_v1(text,text,text[],timestamptz,uuid,uuid[],uuid[]) from public,anon;
grant execute on function public.governance_create_incident_v1(text,text,text[],timestamptz,uuid,uuid[],uuid[]) to authenticated,service_role;
revoke all on function public.governance_add_timeline_v1(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.governance_add_timeline_v1(uuid,text,text,timestamptz) to authenticated,service_role;
revoke all on function public.governance_assign_incident_v1(uuid,uuid,text) from public,anon;
grant execute on function public.governance_assign_incident_v1(uuid,uuid,text) to authenticated,service_role;
revoke all on function public.governance_link_incident_v1(uuid,text,text,text) from public,anon;
grant execute on function public.governance_link_incident_v1(uuid,text,text,text) to authenticated,service_role;
revoke all on function public.governance_change_severity_v1(uuid,text,text) from public,anon;
grant execute on function public.governance_change_severity_v1(uuid,text,text) to authenticated,service_role;
revoke all on function public.governance_review_incident_v1(uuid,text,text) from public,anon;
grant execute on function public.governance_review_incident_v1(uuid,text,text) to authenticated,service_role;
revoke all on function public.governance_set_incident_status_v1(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.governance_set_incident_status_v1(uuid,text,text,text,text,text) to authenticated,service_role;
revoke all on function public.governance_acknowledge_escalation_v1(uuid,text) from public,anon;
grant execute on function public.governance_acknowledge_escalation_v1(uuid,text) to authenticated,service_role;
revoke all on function public.governance_publish_postmortem_v1(uuid,text,text,text,text,text,text,jsonb,uuid) from public,anon;
grant execute on function public.governance_publish_postmortem_v1(uuid,text,text,text,text,text,text,jsonb,uuid) to authenticated,service_role;
revoke all on function public.governance_assign_role_v1(uuid,text,text) from public,anon;
grant execute on function public.governance_assign_role_v1(uuid,text,text) to authenticated,service_role;
revoke all on function public.governance_revoke_role_v1(uuid,text) from public,anon;
grant execute on function public.governance_revoke_role_v1(uuid,text) to authenticated,service_role;
revoke all on function public.governance_admin_overview_v1(text,integer) from public,anon;
grant execute on function public.governance_admin_overview_v1(text,integer) to authenticated,service_role;
revoke all on function public.governance_incident_detail_v1(uuid) from public,anon;
grant execute on function public.governance_incident_detail_v1(uuid) to authenticated,service_role;

comment on table public.governance_incidents is
  'Operational incidents supervising Trust and platform systems. Incident severity is independent from Distribution state.';
comment on table public.governance_audit_events is
  'Immutable Governance audit. Stores minimized old/new operational context, never raw private Trust evidence.';
comment on table public.governance_postmortems is
  'Immutable independently reviewed learning record for resolved major incidents.';
