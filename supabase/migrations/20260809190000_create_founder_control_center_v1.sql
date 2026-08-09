-- Founder Control Center V1: Basel launch gates, evidence, history and KPIs.
--
-- This migration is additive. Founder state is operational metadata and has
-- no product-ranking, enforcement, moderation or user-visible side effects.

create table public.founder_launch_categories (
  category_key text primary key
    check (category_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  weight numeric(5,2) not null check (weight > 0 and weight <= 100),
  sort_order integer not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.founder_launch_gates (
  id uuid primary key default gen_random_uuid(),
  gate_key text not null unique
    check (gate_key ~ '^[a-z][a-z0-9_]*$'),
  category_key text not null
    references public.founder_launch_categories(category_key),
  title text not null,
  description text not null,
  requirement text not null,
  why_it_matters text not null,
  priority text not null check (priority in ('P0', 'P1', 'P2')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'verify', 'verified', 'accepted_risk')),
  owner text,
  evidence jsonb not null default '[]'::jsonb,
  verification_note text,
  related_url text,
  due_date date,
  verification_date timestamptz,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'automatic', 'system')),
  contribution_weight numeric(7,6) not null default 1
    check (contribution_weight > 0 and contribution_weight <= 1),
  review_classification text not null
    check (review_classification in ('ready', 'needs_polish', 'blocker', 'not_needed_freeze')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'array'),
  check (
    status <> 'verified'
    or (
      jsonb_array_length(evidence) > 0
      and nullif(btrim(verification_note), '') is not null
      and verification_date is not null
    )
  )
);

create index founder_launch_gates_priority_status_idx
  on public.founder_launch_gates (priority, status, updated_at desc);
create index founder_launch_gates_category_idx
  on public.founder_launch_gates (category_key, status);

create table public.founder_launch_readiness_history (
  id bigint generated always as identity primary key,
  readiness_percent numeric(5,2) not null check (readiness_percent between 0 and 100),
  launch_status text not null check (launch_status in ('GO', 'BLOCKED')),
  p0_remaining integer not null check (p0_remaining >= 0),
  p1_remaining integer not null check (p1_remaining >= 0),
  p2_remaining integer not null check (p2_remaining >= 0),
  category_readiness jsonb not null check (jsonb_typeof(category_readiness) = 'array'),
  changed_gate_id uuid references public.founder_launch_gates(id) on delete set null,
  change_reason text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index founder_launch_readiness_history_created_idx
  on public.founder_launch_readiness_history (created_at desc, id desc);

create table public.founder_launch_milestones (
  id uuid primary key default gen_random_uuid(),
  milestone_key text not null unique
    check (milestone_key ~ '^[a-z][a-z0-9_]*$'),
  title text not null,
  description text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'verify', 'verified', 'accepted_risk')),
  source_type text not null default 'manual'
    check (source_type in ('manual', 'automatic', 'system')),
  target_date date,
  achieved_at timestamptz,
  sort_order integer not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'verified' and achieved_at is not null) or status <> 'verified')
);

comment on table public.founder_launch_gates is
  'Canonical Basel launch register. Verified is evidence-backed; merged engineering work normally moves a gate only to verify.';
comment on table public.founder_launch_readiness_history is
  'Append-only readiness snapshots recorded after meaningful gate changes.';
comment on table public.founder_launch_milestones is
  'Simple Road to Basel milestones; not a project-management system.';

insert into public.founder_launch_categories (category_key, label, weight, sort_order)
values
  ('product_decision', 'Product / Decision', 25, 10),
  ('security', 'Security', 15, 20),
  ('legal_privacy', 'Legal & Privacy', 15, 30),
  ('basel_data', 'Basel Data', 10, 40),
  ('reliability', 'Reliability', 10, 50),
  ('trust_safety', 'Trust & Safety', 10, 60),
  ('analytics', 'Analytics', 5, 70),
  ('release_app_store', 'Release / App Store', 5, 80),
  ('operations_finance', 'Operations / Finance', 5, 90);

insert into public.founder_launch_gates (
  gate_key, category_key, title, description, requirement, why_it_matters,
  priority, status, owner, evidence, verification_note, related_url,
  verification_date, source_type, contribution_weight, review_classification
) values
  (
    'decision_eligibility', 'product_decision', 'Decision Eligibility',
    'Hard eligibility must reject closed, unavailable or invalid candidates before ranking.',
    'Deterministic acceptance cases prove opening-hours, availability, location and safety exclusions.',
    'An attractive recommendation is harmful when the place is not actually eligible.',
    'P0', 'verify', 'CTO',
    '[{"type":"git","ref":"supabase/migrations/20260808120517_backyrd_canonical_baseline.sql","note":"Canonical decision contracts exist; launch acceptance evidence is still required."}]',
    null, null, null, 'automatic', 0.40, 'blocker'
  ),
  (
    'basel_decision_gold_set', 'product_decision', 'Basel Decision Gold Set',
    'A representative Basel decision-quality set covering moods, time, company and edge cases.',
    'Gold cases are reviewed, versioned and pass the release candidate decision engine.',
    'Launch quality cannot be inferred from code compilation alone.',
    'P0', 'open', 'Founder + Product', '[]', null, null, null, 'manual', 0.35, 'blocker'
  ),
  (
    'canonical_moment_flow', 'product_decision', 'Canonical Moment Flow',
    'The decision-to-real-experience loop has one supported, coherent path.',
    'Decision, spot open, save/visit and later Moment or Review are manually exercised end to end.',
    'Backyrd must improve a real decision rather than only generate engagement.',
    'P1', 'verify', 'Product',
    '[{"type":"git","ref":"mobile/app","note":"Decision and Moment surfaces exist; release E2E remains unproven."}]',
    null, null, null, 'manual', 0.25, 'needs_polish'
  ),
  (
    'credential_secret_security', 'security', 'Credential / Secret Security',
    'Production credentials remain server-only and repository history is secret-scanned.',
    'Secret guard and Gitleaks pass, deployment variables are reviewed, and exposed credentials are rotated.',
    'A single leaked privileged credential can compromise all launch trust.',
    'P0', 'verify', 'CTO',
    '[{"type":"ci","ref":".github/workflows/security.yml","note":"Canonical SQL secret guard and Gitleaks are required CI checks."}]',
    null, null, null, 'system', 0.40, 'blocker'
  ),
  (
    'ai_cost_abuse_protection', 'security', 'AI Cost / Abuse Protection',
    'AI-backed endpoints have authentication, rate limits, timeouts and bounded cost.',
    'Abuse tests and observable limits pass for every launch-critical AI endpoint.',
    'Unbounded public AI traffic can create cost and availability incidents.',
    'P0', 'open', 'CTO', '[]', null, null, null, 'automatic', 0.40, 'blocker'
  ),
  (
    'native_security_permissions', 'security', 'Native Security / Permissions',
    'Mobile permissions and native configuration are minimal and release-safe.',
    'Camera, location, photos, notifications and deep links are audited on release builds.',
    'Permission surprises damage user trust and can block store review.',
    'P1', 'verify', 'Mobile',
    '[{"type":"git","ref":"mobile/app.config.ts","note":"Canonical native configuration exists; device audit is outstanding."}]',
    null, null, null, 'manual', 0.20, 'needs_polish'
  ),
  (
    'legal_privacy_store', 'legal_privacy', 'Legal / Privacy / Store',
    'Published legal documents, consent flows, store disclosures and data-rights operations agree.',
    'Founder records legal approval, store privacy answers and a completed data-rights verification.',
    'Contradictory disclosures or broken rights flows are launch blockers.',
    'P0', 'verify', 'Founder + Legal',
    '[{"type":"git","ref":"legal/safety","note":"Policy sources and canonical Privacy RPCs exist; external approval is not proven in Git."}]',
    null, null, null, 'manual', 1.00, 'blocker'
  ),
  (
    'basel_spot_set', 'basel_data', 'Basel Spot Set',
    'Basel has enough approved, current and decision-eligible spots across launch moods.',
    'A reviewed threshold and coverage report pass against canonical production-like data.',
    'A decision product cannot launch with sparse or unreliable local inventory.',
    'P0', 'open', 'Founder + Data', '[]', null, null, null, 'automatic', 1.00, 'blocker'
  ),
  (
    'production_source_of_truth', 'reliability', 'Production Source of Truth',
    'Canonical migrations, functions and release source are unambiguous and reproducible.',
    'A clean isolated database boot passes and the production release path is documented and rehearsed.',
    'Parallel or manual production state makes every other gate unreliable.',
    'P0', 'verify', 'CTO',
    '[{"type":"ci","ref":"scripts/ci/validate-supabase-local.sh","note":"Fresh canonical boot and migration uniqueness are enforced in CI."}]',
    null, 'https://github.com/PhiluLan/backyrd/pull/4', null, 'system', 0.40, 'blocker'
  ),
  (
    'auth_release_readiness', 'reliability', 'Auth Release Readiness',
    'Signup, verification, login, session recovery and account deletion work on release builds.',
    'Positive and denied auth paths pass with a release candidate against an isolated environment.',
    'Users who cannot reliably enter or leave the product cannot participate in launch.',
    'P0', 'verify', 'CTO + Mobile',
    '[{"type":"git","ref":"supabase/canonical/auth_hooks.sql","note":"Canonical auth lifecycle exists; RC device acceptance remains required."}]',
    null, 'https://github.com/PhiluLan/backyrd/pull/9', null, 'automatic', 0.30, 'blocker'
  ),
  (
    'dependency_risk', 'reliability', 'Dependency Risk',
    'Launch-critical dependencies are supported, reproducible and free of unresolved critical advisories.',
    'Lockfiles are current, critical advisories are resolved or explicitly accepted, and rollback is understood.',
    'A fragile dependency chain can turn a release into an outage.',
    'P1', 'open', 'CTO', '[]', null, null, null, 'system', 0.30, 'needs_polish'
  ),
  (
    'safety_operational_drill', 'trust_safety', 'Safety Operational Drill',
    'The team can triage, decide, enforce, reverse and appeal a realistic safety case.',
    'A documented operational drill proves human review, audit, reversal and appeal paths.',
    'Safety code without operational readiness does not protect users during launch.',
    'P0', 'verify', 'Founder + Trust & Safety',
    '[{"type":"ci","ref":"supabase/tests/sprint8_integrity_case_lifecycle.sql","note":"Lifecycle and authenticity acceptance suites pass; a human operational drill is outstanding."}]',
    null, 'https://github.com/PhiluLan/backyrd/pull/7', null, 'manual', 1.00, 'blocker'
  ),
  (
    'launch_analytics', 'analytics', 'Launch Analytics',
    'WAU, MAU, decisions and core launch health are measured from consent-respecting canonical events.',
    'Event contracts are validated on release builds and metrics reconcile against known fixtures.',
    'Backyrd cannot prove the Basel decision habit without trustworthy measurement.',
    'P1', 'verify', 'Product + Engineering',
    '[{"type":"git","ref":"public.analytics_events","note":"Canonical consent-gated analytics and decision sessions exist; release reconciliation is outstanding."}]',
    null, null, null, 'automatic', 1.00, 'needs_polish'
  ),
  (
    'mobile_release_quality', 'release_app_store', 'Mobile Release Quality',
    'The release candidate is stable on supported iOS and Android devices.',
    'Lint, build, device smoke tests, crash review and upgrade paths pass for the exact candidate.',
    'Development builds do not prove App Store release quality.',
    'P0', 'open', 'Mobile',
    '[{"type":"ci","ref":".github/workflows/quality.yml","note":"Mobile lint passes; typecheck remains advisory and release-device evidence is absent."}]',
    null, null, null, 'system', 0.35, 'blocker'
  ),
  (
    'release_candidate_e2e', 'release_app_store', 'Release Candidate E2E',
    'The exact release candidate passes the launch-critical user journey end to end.',
    'Signup, decision, spot selection, review/moment, privacy and recovery paths pass on physical devices.',
    'Component checks cannot detect broken cross-surface release flows.',
    'P0', 'open', 'CTO + Product', '[]', null, null, null, 'manual', 0.45, 'blocker'
  ),
  (
    'feature_freeze', 'release_app_store', 'Feature Freeze',
    'Only launch-critical fixes enter the candidate after the agreed freeze.',
    'Founder and CTO record the freeze date, candidate commit and exception process.',
    'Uncontrolled scope makes a release candidate impossible to verify.',
    'P1', 'open', 'Founder + CTO', '[]', null, null, null, 'manual', 0.20, 'not_needed_freeze'
  ),
  (
    'owner_minimum', 'operations_finance', 'Owner Minimum',
    'Owner and claim workflows meet the minimum launch support promise without influencing ranking.',
    'Claim verification, approval, revocation and support ownership are exercised end to end.',
    'Broken ownership operations create trust and support failures.',
    'P2', 'verify', 'Founder + Operations',
    '[{"type":"git","ref":"admin-dashboard/app/claims/page.tsx","note":"Claim and owner operations exist; operational acceptance is outstanding."}]',
    null, null, null, 'manual', 0.45, 'needs_polish'
  ),
  (
    'repository_release_source_of_truth', 'operations_finance', 'Repository / Release Source of Truth',
    'Git main, versioned migrations and CI are the durable release record.',
    'Repository sanity, canonical database boot, secret checks and documented runtime ownership pass on main.',
    'Launch decisions cannot rely on backup folders or manually mutated production state.',
    'P0', 'verified', 'CTO',
    '[{"type":"git","ref":"AGENTS.md","note":"Canonical runtime ownership and migration rules are explicit."},{"type":"ci","ref":".github/workflows","note":"Repository, database, quality and security workflows are active on main."}]',
    'Verified from current main: canonical runtime ownership, additive migrations and required CI are enforced.',
    'https://github.com/PhiluLan/backyrd/commit/51d4fc3be151432acfa166410316507fd1698d12',
    '2026-08-09 16:42:43+00', 'system', 0.55, 'ready'
  );

insert into public.founder_launch_milestones (
  milestone_key, title, description, status, source_type, sort_order
) values
  ('internal_alpha', 'Internal Alpha', 'Core product usable by the internal team.', 'verify', 'manual', 10),
  ('founder_control_center', 'Founder Control Center', 'Launch readiness has one operational source of truth.', 'in_progress', 'system', 20),
  ('security_gate', 'Security Gate', 'All P0 security gates are evidence-backed.', 'open', 'system', 30),
  ('closed_beta_50', 'Closed Beta 50', 'Fifty Basel beta participants admitted.', 'open', 'manual', 40),
  ('closed_beta_100', 'Closed Beta 100', 'One hundred Basel beta participants admitted.', 'open', 'manual', 50),
  ('basel_data_gate', 'Basel Data Gate', 'Basel spot coverage and quality threshold verified.', 'open', 'automatic', 60),
  ('app_store_approval', 'App Store Approval', 'Release candidate approved by the store.', 'open', 'manual', 70),
  ('public_soft_launch', 'Public Soft Launch', 'P0-free Basel public availability.', 'open', 'manual', 80),
  ('wau_500', '500 WAU', 'Five hundred weekly active users.', 'open', 'automatic', 90),
  ('wau_1000', '1,000 WAU', 'One thousand weekly active users.', 'open', 'automatic', 100),
  ('basel_pmf_gate', 'Basel PMF Gate', 'Founder-approved evidence of a recurring Basel decision habit.', 'open', 'manual', 110);

create or replace function public.founder_validate_gate_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status in ('in_progress', 'accepted_risk'))
      or (old.status = 'in_progress' and new.status in ('open', 'verify', 'accepted_risk'))
      or (old.status = 'verify' and new.status in ('in_progress', 'verified', 'accepted_risk'))
      or (old.status = 'verified' and new.status = 'verify')
      or (old.status = 'accepted_risk' and new.status in ('open', 'in_progress'))
    ) then
      raise exception 'invalid_founder_gate_transition:%->%', old.status, new.status
        using errcode = '22023';
    end if;
  end if;

  if new.status = 'verified' then
    if jsonb_array_length(new.evidence) = 0
      or nullif(btrim(new.verification_note), '') is null then
      raise exception 'founder_gate_verification_requires_evidence'
        using errcode = '23514';
    end if;
    new.verification_date := coalesce(new.verification_date, now());
  elsif tg_op = 'UPDATE' and old.status = 'verified' and new.status <> 'verified' then
    new.verification_date := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger founder_launch_gate_validate_change
before update on public.founder_launch_gates
for each row execute function public.founder_validate_gate_change_v1();

create or replace function public.founder_calculate_launch_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_categories jsonb;
  v_score numeric(5,2);
  v_p0 integer;
  v_p1 integer;
  v_p2 integer;
begin
  if not coalesce(public.admin_is_admin_v1(), false)
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  with gate_scores as (
    select
      g.category_key,
      g.contribution_weight,
      case g.status
        when 'open' then 0::numeric
        when 'in_progress' then 35::numeric
        when 'verify' then 75::numeric
        when 'accepted_risk' then 75::numeric
        when 'verified' then 100::numeric
      end as readiness
    from public.founder_launch_gates g
  ), category_scores as (
    select
      c.category_key,
      c.label,
      c.weight,
      c.sort_order,
      round(coalesce(sum(gs.readiness * gs.contribution_weight)
        / nullif(sum(gs.contribution_weight), 0), 0), 2) as readiness
    from public.founder_launch_categories c
    left join gate_scores gs on gs.category_key = c.category_key
    group by c.category_key, c.label, c.weight, c.sort_order
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'key', category_key,
      'label', label,
      'weight', weight,
      'readiness', readiness
    ) order by sort_order), '[]'::jsonb),
    round(coalesce(sum(readiness * weight) / 100, 0), 2)
  into v_categories, v_score
  from category_scores;

  select
    count(*) filter (where priority = 'P0' and status in ('open', 'in_progress', 'verify')),
    count(*) filter (where priority = 'P1' and status in ('open', 'in_progress', 'verify')),
    count(*) filter (where priority = 'P2' and status in ('open', 'in_progress', 'verify'))
  into v_p0, v_p1, v_p2
  from public.founder_launch_gates;

  return jsonb_build_object(
    'readiness_percent', v_score,
    'launch_status', case when v_p0 > 0 then 'BLOCKED' else 'GO' end,
    'p0_remaining', v_p0,
    'p1_remaining', v_p1,
    'p2_remaining', v_p2,
    'categories', v_categories,
    'calculated_at', now()
  );
end;
$$;

create or replace function public.founder_record_launch_snapshot_v1(
  p_changed_gate_id uuid default null,
  p_change_reason text default 'gate_changed'
) returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_readiness jsonb;
  v_id bigint;
begin
  if not coalesce(public.admin_is_admin_v1(), false)
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  v_readiness := public.founder_calculate_launch_readiness_v1();
  insert into public.founder_launch_readiness_history (
    readiness_percent, launch_status, p0_remaining, p1_remaining, p2_remaining,
    category_readiness, changed_gate_id, change_reason, actor_user_id
  ) values (
    (v_readiness ->> 'readiness_percent')::numeric,
    v_readiness ->> 'launch_status',
    (v_readiness ->> 'p0_remaining')::integer,
    (v_readiness ->> 'p1_remaining')::integer,
    (v_readiness ->> 'p2_remaining')::integer,
    v_readiness -> 'categories',
    p_changed_gate_id,
    coalesce(nullif(btrim(p_change_reason), ''), 'gate_changed'),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.founder_snapshot_gate_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.founder_record_launch_snapshot_v1(new.id, 'gate_' || new.status);
  return new;
end;
$$;

create trigger founder_launch_gate_snapshot
after update of status, priority, evidence, verification_note, contribution_weight
on public.founder_launch_gates
for each row execute function public.founder_snapshot_gate_change_v1();

create or replace function public.founder_launch_risks_v1(
  p_priority text default null,
  p_status text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.priority when 'P0' then 0 when 'P1' then 1 else 2 end,
    x.updated_at desc), '[]'::jsonb)
  into v_result
  from (
    select g.id, g.gate_key as key, g.category_key, c.label as category,
      g.title, g.description, g.requirement, g.why_it_matters, g.priority,
      g.status, g.owner, g.evidence, g.verification_note, g.related_url,
      g.due_date, g.verification_date, g.updated_at, g.source_type,
      g.contribution_weight, g.review_classification
    from public.founder_launch_gates g
    join public.founder_launch_categories c using (category_key)
    where (p_priority is null or g.priority = p_priority)
      and (p_status is null or g.status = p_status)
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) x;
  return v_result;
end;
$$;

create or replace function public.founder_launch_gate_detail_v1(p_gate_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select to_jsonb(x) into v_result from (
    select g.id, g.gate_key as key, g.category_key, c.label as category,
      c.weight as category_weight, g.title, g.description, g.requirement,
      g.why_it_matters, g.priority, g.status, g.owner, g.evidence,
      g.verification_note, g.related_url, g.due_date, g.verification_date,
      g.updated_at, g.source_type, g.contribution_weight,
      g.review_classification
    from public.founder_launch_gates g
    join public.founder_launch_categories c using (category_key)
    where g.gate_key = p_gate_key
  ) x;
  return v_result;
end;
$$;

create or replace function public.founder_update_launch_gate_v1(
  p_gate_key text,
  p_status text,
  p_evidence jsonb default null,
  p_verification_note text default null,
  p_related_url text default null,
  p_owner text default null,
  p_due_date date default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gate public.founder_launch_gates%rowtype;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'array' then
    raise exception 'evidence_must_be_array' using errcode = '22023';
  end if;
  update public.founder_launch_gates
  set status = p_status,
      evidence = coalesce(p_evidence, evidence),
      verification_note = coalesce(p_verification_note, verification_note),
      related_url = coalesce(p_related_url, related_url),
      owner = coalesce(p_owner, owner),
      due_date = coalesce(p_due_date, due_date)
  where gate_key = p_gate_key
  returning * into v_gate;
  if v_gate.id is null then
    raise exception 'founder_gate_not_found' using errcode = 'P0002';
  end if;
  return public.founder_launch_gate_detail_v1(p_gate_key);
end;
$$;

create or replace function public.founder_core_kpis_v1(p_as_of timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'invalid_kpi_time' using errcode = '22023';
  end if;
  with activity as (
    select user_id, occurred_at from public.analytics_events
    union all select user_id, created_at from public.decision_sessions
    union all select user_id, created_at from public.reviews
  )
  select jsonb_build_object(
    'as_of', p_as_of,
    'wau', (select count(distinct user_id) from activity
      where user_id is not null and occurred_at >= p_as_of - interval '7 days' and occurred_at < p_as_of),
    'mau', (select count(distinct user_id) from activity
      where user_id is not null and occurred_at >= p_as_of - interval '30 days' and occurred_at < p_as_of),
    'decisions_week', (select count(*) from public.decision_sessions
      where created_at >= p_as_of - interval '7 days' and created_at < p_as_of),
    'basel_launch_ready_spots', (select count(*) from public.spots
      where status = 'approved' and lower(coalesce(city, '')) in ('basel', 'basel-stadt')),
    'open_trust_alerts', (select count(*) from public.safety_cases
      where case_status in ('queued', 'evaluating', 'needs_review', 'appealed', 'failed')),
    'decision_success', jsonb_build_object(
      'status', 'data_not_ready',
      'value', null,
      'reason', 'No canonical real-world decision outcome contract is reliable enough for launch reporting.'
    )
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.founder_data_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'approved_spots', (select count(*) from public.spots where status = 'approved'),
    'approved_basel_spots', (select count(*) from public.spots where status = 'approved' and lower(coalesce(city, '')) in ('basel', 'basel-stadt')),
    'approved_basel_spots_missing_photo', (select count(*) from public.spots where status = 'approved' and lower(coalesce(city, '')) in ('basel', 'basel-stadt') and header_photo_path is null and google_place_id is null),
    'decision_outcome_contract', 'data_not_ready',
    'calculated_at', now()
  );
end;
$$;

create or replace function public.founder_trust_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open_cases', (select count(*) from public.safety_cases where case_status in ('queued', 'evaluating', 'needs_review', 'appealed', 'failed')),
    'needs_human_review', (select count(*) from public.safety_cases where case_status in ('needs_review', 'appealed')),
    'failed_cases', (select count(*) from public.safety_cases where case_status = 'failed'),
    'calculated_at', now(),
    'interpretation', 'Signals and open cases are operational indicators, never proof.'
  );
end;
$$;

create or replace function public.founder_launch_milestones_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by sort_order), '[]'::jsonb)
  into v_result from public.founder_launch_milestones m;
  return v_result;
end;
$$;

create or replace function public.founder_launch_overview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'readiness', public.founder_calculate_launch_readiness_v1(),
    'kpis', public.founder_core_kpis_v1(now()),
    'data_health', public.founder_data_health_v1(),
    'trust_health', public.founder_trust_health_v1(),
    'blockers', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
      from (select gate_key as key, title, priority, status, owner, source_type, updated_at
        from public.founder_launch_gates
        where priority = 'P0' and status in ('open', 'in_progress', 'verify')
        order by updated_at desc limit 8) x
    ),
    'recently_verified', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.verification_date desc), '[]'::jsonb)
      from (select gate_key as key, title, verification_date, verification_note
        from public.founder_launch_gates where status = 'verified'
        order by verification_date desc nulls last limit 6) x
    ),
    'history', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
      from (select readiness_percent, launch_status, p0_remaining, created_at
        from public.founder_launch_readiness_history order by created_at desc limit 20) x
    ),
    'milestones', public.founder_launch_milestones_v1(),
    'last_updated', (select max(updated_at) from public.founder_launch_gates)
  );
end;
$$;

alter table public.founder_launch_categories enable row level security;
alter table public.founder_launch_gates enable row level security;
alter table public.founder_launch_readiness_history enable row level security;
alter table public.founder_launch_milestones enable row level security;

create policy founder_launch_categories_admin_only on public.founder_launch_categories
  for all to authenticated using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());
create policy founder_launch_gates_admin_only on public.founder_launch_gates
  for all to authenticated using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());
create policy founder_launch_history_admin_only on public.founder_launch_readiness_history
  for all to authenticated using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());
create policy founder_launch_milestones_admin_only on public.founder_launch_milestones
  for all to authenticated using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());

revoke all on table public.founder_launch_categories from public, anon, authenticated;
revoke all on table public.founder_launch_gates from public, anon, authenticated;
revoke all on table public.founder_launch_readiness_history from public, anon, authenticated;
revoke all on table public.founder_launch_milestones from public, anon, authenticated;
revoke all on sequence public.founder_launch_readiness_history_id_seq from public, anon, authenticated;

grant all on table public.founder_launch_categories to service_role;
grant all on table public.founder_launch_gates to service_role;
grant all on table public.founder_launch_readiness_history to service_role;
grant all on table public.founder_launch_milestones to service_role;
grant all on sequence public.founder_launch_readiness_history_id_seq to service_role;

revoke all on function public.founder_validate_gate_change_v1() from public, anon, authenticated;
revoke all on function public.founder_snapshot_gate_change_v1() from public, anon, authenticated;
revoke all on function public.founder_record_launch_snapshot_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.founder_calculate_launch_readiness_v1() from public, anon;
revoke all on function public.founder_launch_risks_v1(text, text, integer) from public, anon;
revoke all on function public.founder_launch_gate_detail_v1(text) from public, anon;
revoke all on function public.founder_update_launch_gate_v1(text, text, jsonb, text, text, text, date) from public, anon;
revoke all on function public.founder_core_kpis_v1(timestamptz) from public, anon;
revoke all on function public.founder_data_health_v1() from public, anon;
revoke all on function public.founder_trust_health_v1() from public, anon;
revoke all on function public.founder_launch_milestones_v1() from public, anon;
revoke all on function public.founder_launch_overview_v1() from public, anon;

grant execute on function public.founder_calculate_launch_readiness_v1() to authenticated, service_role;
grant execute on function public.founder_launch_risks_v1(text, text, integer) to authenticated, service_role;
grant execute on function public.founder_launch_gate_detail_v1(text) to authenticated, service_role;
grant execute on function public.founder_update_launch_gate_v1(text, text, jsonb, text, text, text, date) to authenticated, service_role;
grant execute on function public.founder_core_kpis_v1(timestamptz) to authenticated, service_role;
grant execute on function public.founder_data_health_v1() to authenticated, service_role;
grant execute on function public.founder_trust_health_v1() to authenticated, service_role;
grant execute on function public.founder_launch_milestones_v1() to authenticated, service_role;
grant execute on function public.founder_launch_overview_v1() to authenticated, service_role;
grant execute on function public.founder_record_launch_snapshot_v1(uuid, text) to service_role;

-- Initial historical baseline after all launch-register seeds are present.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select public.founder_record_launch_snapshot_v1(null, 'founder_control_center_v1_seed');
reset role;
