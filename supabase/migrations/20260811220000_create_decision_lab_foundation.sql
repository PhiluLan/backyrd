-- D1 Decision Lab V1: lab-only latent truth and experiment metadata.
-- Product-observed synthetic state continues to use canonical public/auth contracts.
-- This schema is intentionally not exposed by supabase/config.toml.

create schema if not exists decision_lab authorization postgres;
revoke all on schema decision_lab from public, anon, authenticated, service_role;
grant usage, create on schema decision_lab to postgres;

create table decision_lab.worlds (
  world_id uuid primary key,
  seed text not null,
  generator_version text not null,
  ground_truth_version text not null,
  scenario_set_version text not null,
  evaluation_version text not null,
  git_sha text not null,
  migration_hash text not null,
  engine_source_hash text not null,
  embedding_mode text not null check (embedding_mode in ('FULL_FIDELITY', 'FAST_SIMULATION')),
  manifest jsonb not null,
  world_hash text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table decision_lab.latent_users (
  world_id uuid not null references decision_lab.worlds(world_id) on delete cascade,
  synthetic_user_id uuid not null,
  persona text not null,
  maturity text not null,
  latent_truth jsonb not null,
  primary key (world_id, synthetic_user_id)
);

create table decision_lab.latent_spots (
  world_id uuid not null references decision_lab.worlds(world_id) on delete cascade,
  synthetic_spot_id uuid not null,
  latent_truth jsonb not null,
  primary key (world_id, synthetic_spot_id)
);

create table decision_lab.latent_contexts (
  world_id uuid not null references decision_lab.worlds(world_id) on delete cascade,
  context_id uuid not null,
  latent_truth jsonb not null,
  primary key (world_id, context_id)
);

create table decision_lab.scenarios (
  scenario_id uuid primary key,
  world_id uuid not null references decision_lab.worlds(world_id) on delete cascade,
  partition text not null check (partition in ('DEVELOPMENT', 'REGRESSION', 'LOCKED_HOLDOUT')),
  name text not null,
  observed_input jsonb not null,
  latent_context_id uuid,
  finding_id text,
  created_at timestamptz not null default now()
);

create table decision_lab.experiments (
  experiment_id uuid primary key,
  world_id uuid not null references decision_lab.worlds(world_id) on delete restrict,
  scenario_set_version text not null,
  engine_snapshot jsonb not null,
  run_configuration jsonb not null,
  status text not null check (status in ('created', 'world_ready', 'history_ready', 'embeddings_ready', 'running', 'completed', 'failed', 'invalid')),
  invalid_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table decision_lab.ground_truth_utilities (
  experiment_id uuid not null references decision_lab.experiments(experiment_id) on delete cascade,
  scenario_id uuid not null references decision_lab.scenarios(scenario_id) on delete cascade,
  synthetic_spot_id uuid not null,
  utility numeric not null check (utility between 0 and 1),
  components jsonb not null,
  constraints jsonb not null,
  primary key (experiment_id, scenario_id, synthetic_spot_id)
);

create table decision_lab.flight_recorder_traces (
  trace_id uuid primary key,
  experiment_id uuid not null references decision_lab.experiments(experiment_id) on delete cascade,
  scenario_id uuid not null references decision_lab.scenarios(scenario_id) on delete cascade,
  observed_engine_trace jsonb not null,
  latent_evaluation jsonb not null,
  complete boolean not null default false,
  created_at timestamptz not null default now()
);

create index decision_lab_scenarios_world_idx on decision_lab.scenarios(world_id, partition);
create index decision_lab_experiments_world_idx on decision_lab.experiments(world_id, created_at desc);
create index decision_lab_traces_experiment_idx on decision_lab.flight_recorder_traces(experiment_id, scenario_id);

revoke all on all tables in schema decision_lab from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema decision_lab to postgres;
alter default privileges for role postgres in schema decision_lab revoke all on tables from public, anon, authenticated, service_role;

comment on schema decision_lab is 'Disposable Decision Lab metadata and latent truth. Never exposed to Product clients or Production.';
comment on table decision_lab.flight_recorder_traces is 'Observed engine trace and latent evaluation are stored in separate JSON documents; latent data is never an engine input.';
