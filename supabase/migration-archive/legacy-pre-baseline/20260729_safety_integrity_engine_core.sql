-- Backyrd Safety & Integrity Engine — Core
-- Designed for shadow-first deployment and policy-versioned moderation.

create table if not exists public.safety_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version text not null,
  status text not null default 'draft',
  policy jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(policy_key, version),
  check (status in ('draft','shadow','active','retired'))
);

create table if not exists public.safety_content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  entity_type text not null,
  entity_id uuid,
  spot_id uuid references public.spots(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  locale text,
  text_content text,
  image_urls text[] not null default '{}'::text[],
  context jsonb not null default '{}'::jsonb,
  content_hash text,
  lifecycle_status text not null default 'live',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lifecycle_status in ('draft','live','limited','hidden','removed','deleted'))
);

create table if not exists public.safety_cases (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.safety_content_items(id) on delete cascade,
  policy_version_id uuid references public.safety_policy_versions(id) on delete set null,
  case_status text not null default 'queued',
  priority integer not null default 50,
  final_action text,
  final_category text,
  final_severity integer,
  final_confidence numeric(8,7),
  decision_source text,
  explanation_code text,
  explanation_public text,
  explanation_internal text,
  assigned_to uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (case_status in ('queued','evaluating','needs_review','decided','appealed','closed','failed')),
  check (final_action is null or final_action in ('allow','allow_log','limit','temporary_hide','remove','block_submit','escalate'))
);

create table if not exists public.safety_signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.safety_cases(id) on delete cascade,
  signal_type text not null,
  provider text not null,
  model text,
  model_version text,
  categories jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  flagged boolean,
  raw_response jsonb,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.safety_decision_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.safety_cases(id) on delete cascade,
  action text not null,
  category text,
  severity integer,
  confidence numeric(8,7),
  source text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'::text[],
  actor_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.safety_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.safety_cases(id) on delete cascade,
  appellant_user_id uuid not null references public.profiles(id) on delete cascade,
  statement text,
  status text not null default 'submitted',
  outcome text,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (status in ('submitted','in_review','decided','withdrawn')),
  check (outcome is null or outcome in ('upheld','overturned','modified'))
);

create table if not exists public.safety_evaluation_examples (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  content_type text not null,
  locale text not null,
  input_text text,
  input_images text[] not null default '{}'::text[],
  context jsonb not null default '{}'::jsonb,
  expected_action text not null,
  expected_categories text[] not null default '{}'::text[],
  expected_severity integer,
  difficulty text not null default 'normal',
  notes text,
  labeler_count integer not null default 1,
  adjudicated boolean not null default false,
  created_at timestamptz not null default now(),
  check (difficulty in ('easy','normal','hard','adversarial'))
);

create table if not exists public.safety_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  policy_version_id uuid references public.safety_policy_versions(id) on delete set null,
  model_manifest jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_safety_cases_status_priority on public.safety_cases(case_status, priority desc, created_at);
create index if not exists idx_safety_content_entity on public.safety_content_items(entity_type, entity_id);
create index if not exists idx_safety_content_spot on public.safety_content_items(spot_id, created_at desc);
create index if not exists idx_safety_signals_case on public.safety_signals(case_id, created_at);
create index if not exists idx_safety_decisions_case on public.safety_decision_events(case_id, created_at);
create index if not exists idx_safety_appeals_status on public.safety_appeals(status, submitted_at);

alter table public.safety_policy_versions enable row level security;
alter table public.safety_content_items enable row level security;
alter table public.safety_cases enable row level security;
alter table public.safety_signals enable row level security;
alter table public.safety_decision_events enable row level security;
alter table public.safety_appeals enable row level security;
alter table public.safety_evaluation_examples enable row level security;
alter table public.safety_evaluation_runs enable row level security;

create or replace function public.safety_is_admin_v1(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = coalesce(p_user_id, auth.uid())
      and coalesce(p.is_admin,false)=true
  );
$$;

create policy "safety_admin_policy_versions" on public.safety_policy_versions
for all to authenticated using (public.safety_is_admin_v1()) with check (public.safety_is_admin_v1());

create policy "safety_content_actor_or_admin" on public.safety_content_items
for select to authenticated using (actor_user_id = auth.uid() or public.safety_is_admin_v1());

create policy "safety_cases_admin_or_actor" on public.safety_cases
for select to authenticated using (
  public.safety_is_admin_v1()
  or exists(select 1 from public.safety_content_items i where i.id=content_item_id and i.actor_user_id=auth.uid())
);

create policy "safety_signals_admin" on public.safety_signals
for select to authenticated using (public.safety_is_admin_v1());

create policy "safety_decisions_admin_or_actor" on public.safety_decision_events
for select to authenticated using (
  public.safety_is_admin_v1()
  or exists(
    select 1 from public.safety_cases c
    join public.safety_content_items i on i.id=c.content_item_id
    where c.id=case_id and i.actor_user_id=auth.uid()
  )
);

create policy "safety_appeals_own_or_admin" on public.safety_appeals
for select to authenticated using (appellant_user_id=auth.uid() or public.safety_is_admin_v1());

create policy "safety_appeals_insert_own" on public.safety_appeals
for insert to authenticated with check (appellant_user_id=auth.uid());

create policy "safety_eval_admin_examples" on public.safety_evaluation_examples
for all to authenticated using (public.safety_is_admin_v1()) with check (public.safety_is_admin_v1());

create policy "safety_eval_admin_runs" on public.safety_evaluation_runs
for all to authenticated using (public.safety_is_admin_v1()) with check (public.safety_is_admin_v1());

revoke all on public.safety_policy_versions, public.safety_content_items, public.safety_cases,
  public.safety_signals, public.safety_decision_events, public.safety_appeals,
  public.safety_evaluation_examples, public.safety_evaluation_runs from anon;

grant select on public.safety_policy_versions to authenticated;
grant select on public.safety_content_items to authenticated;
grant select on public.safety_cases to authenticated;
grant select on public.safety_signals to authenticated;
grant select on public.safety_decision_events to authenticated;
grant select, insert on public.safety_appeals to authenticated;
grant select on public.safety_evaluation_examples to authenticated;
grant select on public.safety_evaluation_runs to authenticated;
grant all on all tables in schema public to service_role;

create or replace function public.safety_get_current_policy_v1(p_policy_key text default 'backyrd-global')
returns public.safety_policy_versions
language sql stable security definer set search_path=public
as $$
  select *
  from public.safety_policy_versions
  where policy_key=p_policy_key and status in ('active','shadow')
  order by case status when 'active' then 0 else 1 end, activated_at desc nulls last, created_at desc
  limit 1;
$$;

create or replace function public.safety_submit_content_v1(
  p_content_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_spot_id uuid default null,
  p_text_content text default null,
  p_image_urls text[] default '{}'::text[],
  p_locale text default null,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_item_id uuid;
  v_case_id uuid;
  v_policy public.safety_policy_versions%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_policy from public.safety_get_current_policy_v1('backyrd-global');

  insert into public.safety_content_items(
    content_type, entity_type, entity_id, spot_id, actor_user_id,
    locale, text_content, image_urls, context
  ) values(
    p_content_type, p_entity_type, p_entity_id, p_spot_id, auth.uid(),
    p_locale, nullif(p_text_content,''), coalesce(p_image_urls,'{}'::text[]), coalesce(p_context,'{}'::jsonb)
  ) returning id into v_item_id;

  insert into public.safety_cases(content_item_id, policy_version_id, case_status, priority)
  values(v_item_id, v_policy.id, 'queued', 50)
  returning id into v_case_id;

  return jsonb_build_object('ok',true,'content_item_id',v_item_id,'case_id',v_case_id,'policy_version',v_policy.version);
end;
$$;

create or replace function public.safety_admin_queue_v1(
  p_status text default null,
  p_limit integer default 200
)
returns table(
  case_id uuid, content_item_id uuid, content_type text, entity_type text, entity_id uuid,
  spot_id uuid, actor_user_id uuid, actor_name text, case_status text, priority integer,
  final_action text, final_category text, final_severity integer, final_confidence numeric,
  explanation_public text, text_content text, image_urls text[], locale text,
  context jsonb, created_at timestamptz
)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.safety_is_admin_v1() then raise exception 'admin_required'; end if;
  return query
  select c.id,i.id,i.content_type,i.entity_type,i.entity_id,i.spot_id,i.actor_user_id,
    coalesce(p.display_name,p.username,concat_ws(' ',p.first_name,p.last_name),i.actor_user_id::text),
    c.case_status,c.priority,c.final_action,c.final_category,c.final_severity,c.final_confidence,
    c.explanation_public,i.text_content,i.image_urls,i.locale,i.context,c.created_at
  from public.safety_cases c
  join public.safety_content_items i on i.id=c.content_item_id
  left join public.profiles p on p.id=i.actor_user_id
  where p_status is null or c.case_status=p_status
  order by c.priority desc,c.created_at asc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

create or replace function public.safety_admin_decide_v1(
  p_case_id uuid,
  p_action text,
  p_category text default null,
  p_severity integer default null,
  p_confidence numeric default null,
  p_public_explanation text default null,
  p_internal_explanation text default null,
  p_reason_codes text[] default '{}'::text[]
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_case public.safety_cases%rowtype;
begin
  if not public.safety_is_admin_v1() then raise exception 'admin_required'; end if;
  if p_action not in ('allow','allow_log','limit','temporary_hide','remove','block_submit','escalate') then
    raise exception 'invalid_action';
  end if;

  update public.safety_cases set
    case_status='decided', final_action=p_action, final_category=p_category,
    final_severity=p_severity, final_confidence=p_confidence,
    decision_source='human', explanation_public=p_public_explanation,
    explanation_internal=p_internal_explanation, decided_by=auth.uid(),
    decided_at=now(), updated_at=now()
  where id=p_case_id returning * into v_case;

  if v_case.id is null then raise exception 'case_not_found'; end if;

  insert into public.safety_decision_events(
    case_id,action,category,severity,confidence,source,reason_codes,actor_user_id
  ) values(
    p_case_id,p_action,p_category,p_severity,p_confidence,'human',coalesce(p_reason_codes,'{}'::text[]),auth.uid()
  );

  return jsonb_build_object('ok',true,'case_id',p_case_id,'action',p_action);
end;
$$;

grant execute on function public.safety_submit_content_v1(text,text,uuid,uuid,text,text[],text,jsonb) to authenticated, service_role;
grant execute on function public.safety_admin_queue_v1(text,integer) to authenticated, service_role;
grant execute on function public.safety_admin_decide_v1(uuid,text,text,integer,numeric,text,text,text[]) to authenticated, service_role;
grant execute on function public.safety_get_current_policy_v1(text) to authenticated, service_role;

insert into public.safety_policy_versions(policy_key,version,status,policy,activated_at)
values(
  'backyrd-global',
  '2026-07-29.1',
  'shadow',
  $policy$
{
  "policy_id":"backyrd-global",
  "version":"2026-07-29.1",
  "status":"shadow",
  "locales":["de-CH","de-DE","en","fr-CH","it-CH"],
  "principles":["context_sensitive","severity_and_confidence","human_review","appeals","auditability","shadow_first"],
  "content_types":{
    "owner_spot_profile":{"tolerance":"low","review_threshold":0.55,"temporary_hide_threshold":0.92},
    "review":{"tolerance":"medium","review_threshold":0.65,"temporary_hide_threshold":0.95},
    "moment":{"tolerance":"medium","review_threshold":0.65,"temporary_hide_threshold":0.95},
    "profile_text":{"tolerance":"low","review_threshold":0.60,"temporary_hide_threshold":0.93}
  }
}
$policy$::jsonb,
  now()
)
on conflict(policy_key,version) do nothing;
