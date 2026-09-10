-- World Knowledge Slice 3B: accepted policy, immutable persistence and shadow-only resolution.
-- This migration creates no Production backfill, trigger, schedule, client integration or runtime activation.

create schema if not exists world_knowledge_private;
revoke all on schema world_knowledge_private from public, anon, authenticated;
grant usage on schema world_knowledge_private to service_role;

create table world_knowledge_private.registry_releases (
  registry_version text primary key,
  registry_hash text not null unique check (registry_hash ~ '^[0-9a-f]{64}$'),
  predecessor_version text references world_knowledge_private.registry_releases(registry_version),
  change_class text not null check (change_class in ('LABEL_ONLY','ADDITIVE_DEFINITION','ADDITIVE_ALLOWED_VALUE','SEMANTIC_CHANGE','DEPRECATION','REMOVAL','KEY_REPLACEMENT')),
  definitions jsonb not null check (jsonb_typeof(definitions)='array'),
  release_hash text not null unique check (release_hash ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null,
  created_at timestamptz not null,
  check (created_at >= approved_at)
);

create table world_knowledge_private.governance_approval_records (
  id uuid primary key default gen_random_uuid(),
  registry_version text not null references world_knowledge_private.registry_releases(registry_version),
  authority_class text not null check (authority_class in ('PRODUCT_CTO','WORLD_KNOWLEDGE_GOVERNANCE')),
  authority_reference text not null,
  approved_at timestamptz not null,
  record_hash text not null unique check (record_hash ~ '^[0-9a-f]{64}$')
);

create table world_knowledge_private.attribute_definitions (
  registry_version text not null references world_knowledge_private.registry_releases(registry_version),
  attribute_key text not null check (attribute_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  value_type text not null check (value_type in ('TEXT','EMAIL','URL','PHONE','COUNTRY_CODE','IANA_TIMEZONE','DECIMAL','BOOLEAN','ENUM','ENUM_SET','MONEY_RANGE','INTEGER','INTEGER_RANGE','RESERVATION_RULE','CONSUMPTION_RULE','PET_ACCESS_RULE','AGE_ACCESS_RULE','WEEKLY_SCHEDULE','SPECIAL_HOURS','CURRENT_STATE')),
  allowed_values jsonb,
  minimum numeric,
  maximum numeric,
  engine_authorization text not null check (engine_authorization in ('AUTHORIZED','EXPLANATION_ONLY')),
  primary key (registry_version,attribute_key),
  check (allowed_values is null or jsonb_typeof(allowed_values)='array')
);

create table world_knowledge_private.source_policy_releases (
  policy_version text primary key,
  policy_hash text not null unique check (policy_hash ~ '^[0-9a-f]{64}$'),
  registry_version text not null references world_knowledge_private.registry_releases(registry_version),
  registry_hash text not null check (registry_hash ~ '^[0-9a-f]{64}$'),
  policy jsonb not null check (jsonb_typeof(policy)='object'),
  state text not null check (state in ('ACCEPTED','RETIRED')),
  approved_at timestamptz not null
);

create table world_knowledge_private.source_policy_attribute_rules (
  policy_version text not null references world_knowledge_private.source_policy_releases(policy_version),
  attribute_key text not null,
  allowed_source_types text[] not null,
  allowed_actor_types text[] not null,
  source_reference_requirement text not null check (source_reference_requirement in ('REQUIRED','OPTIONAL','FORBIDDEN')),
  self_assertion_allowed boolean not null,
  verification_process_ids text[] not null,
  freshness_policy_ref text not null,
  allowed_use_cases text[] not null,
  primary key(policy_version,attribute_key)
);

create table world_knowledge_private.entitlement_policy_releases (
  policy_version text primary key,
  policy_hash text not null unique check (policy_hash ~ '^[0-9a-f]{64}$'),
  registry_version text not null references world_knowledge_private.registry_releases(registry_version),
  policy jsonb not null check (jsonb_typeof(policy)='object'),
  state text not null check (state in ('ACCEPTED','RETIRED')),
  approved_at timestamptz not null
);

create table world_knowledge_private.entitlement_attribute_rules (
  policy_version text not null references world_knowledge_private.entitlement_policy_releases(policy_version),
  actor_scope text not null check (actor_scope in ('OWNER_BASIC','OWNER_PRO','ADMIN')),
  attribute_key text not null,
  primary key(policy_version,actor_scope,attribute_key),
  foreign key(policy_version) references world_knowledge_private.entitlement_policy_releases(policy_version)
);

create table world_knowledge_private.actor_bindings (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_pseudonym_id uuid not null default gen_random_uuid() unique,
  actor_type text not null check (actor_type in ('VERIFIED_OWNER','ADMIN','SYSTEM','PUBLIC_CONTRIBUTOR')),
  detached_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((actor_id is null) = (detached_at is not null))
);
create unique index world_actor_bindings_active_identity_unique
  on world_knowledge_private.actor_bindings(actor_id,actor_type)
  where actor_id is not null;

create table world_knowledge_private.source_references (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  source_type text not null check (source_type in ('OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE','PUBLIC_SOURCE','USER_REPORT','SYSTEM_DERIVATION','AI_INFERENCE','LEGACY_IMPORT')),
  public_reference text,
  private_payload jsonb,
  visibility text not null check (visibility in ('PUBLIC','INTERNAL','PRIVATE')),
  created_at timestamptz not null default clock_timestamp(),
  source_hash text not null unique check (source_hash ~ '^[0-9a-f]{64}$'),
  check (private_payload is null or jsonb_typeof(private_payload)='object')
);

create table world_knowledge_private.claims (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  spot_id uuid not null references public.spots(id) on delete restrict,
  registry_version text not null,
  policy_version text not null references world_knowledge_private.source_policy_releases(policy_version),
  attribute_key text not null,
  scope text not null default 'SPOT',
  knowledge_state text not null check (knowledge_state in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE','UNKNOWN')),
  value jsonb,
  actor_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  actor_type text not null check (actor_type in ('VERIFIED_OWNER','ADMIN','SYSTEM','PUBLIC_CONTRIBUTOR')),
  source_reference_id uuid not null references world_knowledge_private.source_references(id) on delete restrict,
  source_type text not null check (source_type in ('OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE','PUBLIC_SOURCE','USER_REPORT','SYSTEM_DERIVATION','AI_INFERENCE','LEGACY_IMPORT')),
  observed_at timestamptz not null,
  valid_from timestamptz,
  valid_until timestamptz,
  last_changed_at timestamptz not null,
  stance text not null check (stance in ('SUPPORTS','CONTRADICTS')),
  visibility text not null check (visibility in ('PUBLIC','INTERNAL','PRIVATE','SHADOW_HELD')),
  supersedes_claim_id uuid references world_knowledge_private.claims(id) on delete restrict,
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(actor_binding_id,idempotency_key),
  foreign key(registry_version,attribute_key) references world_knowledge_private.attribute_definitions(registry_version,attribute_key),
  check ((knowledge_state='UNKNOWN' and value is null) or (knowledge_state<>'UNKNOWN' and value is not null)),
  check ((actor_type='VERIFIED_OWNER' and source_type='OWNER_ASSERTION') or (actor_type='ADMIN' and source_type='ADMIN_OBSERVATION') or actor_type in ('SYSTEM','PUBLIC_CONTRIBUTOR')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (attribute_key<>'state.current' or valid_until is not null)
);
create index world_claims_resolve_idx on world_knowledge_private.claims(spot_id,attribute_key,scope,observed_at desc,id);

create table world_knowledge_private.verification_records (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references world_knowledge_private.claims(id) on delete restrict,
  claim_hash text not null check (claim_hash ~ '^[0-9a-f]{64}$'),
  spot_id uuid not null references public.spots(id) on delete restrict,
  attribute_key text not null,
  scope text not null,
  policy_version text not null references world_knowledge_private.source_policy_releases(policy_version),
  verification_method text not null check (verification_method in ('OWNER_CONFIRMED','ADMIN_CONFIRMED','INDEPENDENT_PROCESS')),
  execution_authority text not null check (execution_authority in ('SERVER_BOUND_OWNER_WRITE','SERVER_BOUND_ADMIN_WRITE','ACCEPTED_INDEPENDENT_PROCESS')),
  verifier_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  result text not null check (result in ('VERIFIED','REJECTED','INCONCLUSIVE','REQUIRES_REVIEW')),
  checked_at timestamptz not null,
  reverification_policy_ref text not null,
  reason_codes text[] not null,
  result_hash text not null unique check (result_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(claim_id,verification_method,result_hash)
);

create table world_knowledge_private.confirmation_records (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references world_knowledge_private.claims(id) on delete restrict,
  claim_hash text not null check (claim_hash ~ '^[0-9a-f]{64}$'),
  actor_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  confirmation_method text not null check (confirmation_method in ('OWNER_CONFIRMED','ADMIN_CONFIRMED')),
  policy_version text not null references world_knowledge_private.source_policy_releases(policy_version),
  reconfirmation_policy_ref text not null,
  confirmed_at timestamptz not null,
  confirmation_due_at timestamptz not null,
  idempotency_key text not null,
  record_hash text not null unique check (record_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(actor_binding_id,idempotency_key),
  check (confirmation_due_at > confirmed_at)
);

create table world_knowledge_private.identity_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('DUPLICATE_SUSPECTED','MERGE_PROPOSED')),
  subject_spot_id uuid not null references public.spots(id) on delete restrict,
  related_spot_id uuid references public.spots(id) on delete restrict,
  external_namespace text,
  external_reference_hash text check (external_reference_hash is null or external_reference_hash ~ '^[0-9a-f]{64}$'),
  authority_record_id uuid references world_knowledge_private.governance_approval_records(id) on delete restrict,
  recorded_by_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  idempotency_key text not null,
  occurred_at timestamptz not null,
  reason_codes text[] not null,
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$'),
  unique(recorded_by_binding_id,idempotency_key),
  check (subject_spot_id is distinct from related_spot_id),
  check (related_spot_id is not null),
  check (authority_record_id is null)
);

create table world_knowledge_private.review_work_items (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  work_class text not null check (work_class in ('USER_REPORT','AUTHORITY_CONFLICT','CONTENT_SAFETY','DUPLICATE_CANDIDATE','HOLIDAY_HOURS_REMINDER','CONFIRMATION_DUE')),
  priority text not null check (priority in ('URGENT','HIGH','NORMAL','LOW')),
  status text not null check (status in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')) default 'OPEN',
  attribute_key text,
  candidate_payload jsonb,
  reporter_binding_id uuid references world_knowledge_private.actor_bindings(id) on delete set null,
  reason_codes text[] not null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by_binding_id uuid references world_knowledge_private.actor_bindings(id) on delete restrict,
  resolution_reason text
);

create table world_knowledge_private.review_work_item_events (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references world_knowledge_private.review_work_items(id) on delete restrict,
  event_type text not null,
  actor_binding_id uuid references world_knowledge_private.actor_bindings(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb,
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$')
);

create table world_knowledge_private.resolution_manifests (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  registry_version text not null references world_knowledge_private.registry_releases(registry_version),
  policy_version text not null references world_knowledge_private.source_policy_releases(policy_version),
  as_of timestamptz not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  resolution_hash text not null check (resolution_hash ~ '^[0-9a-f]{64}$'),
  manifest_hash text not null unique check (manifest_hash ~ '^[0-9a-f]{64}$'),
  world_snapshot jsonb not null check (jsonb_typeof(world_snapshot)='object'),
  decision_projection jsonb not null check (jsonb_typeof(decision_projection)='object'),
  created_at timestamptz not null default clock_timestamp(),
  unique(spot_id,registry_version,policy_version,input_hash)
);

create table world_knowledge_private.resolution_entries (
  manifest_id uuid not null references world_knowledge_private.resolution_manifests(id) on delete restrict,
  attribute_key text not null,
  scope text not null,
  resolution text not null check (resolution in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE','UNKNOWN','DISPUTED')),
  value jsonb,
  trust text not null check (trust in ('ASSERTED','REFERENCED','VERIFIED','CONFLICTING')),
  freshness text not null check (freshness in ('CURRENT','STALE','EXPIRED')),
  basis_claim_hashes text[] not null,
  conflict_claim_hashes text[] not null default '{}',
  entry_hash text not null check (entry_hash ~ '^[0-9a-f]{64}$'),
  primary key(manifest_id,attribute_key,scope)
);

create table world_knowledge_private.current_projection_pointers (
  spot_id uuid primary key references public.spots(id) on delete restrict,
  manifest_id uuid not null references world_knowledge_private.resolution_manifests(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp()
);

create table world_knowledge_private.shadow_spot_allowlist (
  spot_id uuid primary key references public.spots(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  check (valid_until > created_at)
);

create table world_knowledge_private.rebuild_jobs (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  idempotency_key text not null unique,
  mode text not null check (mode in ('FULL','INCREMENTAL')),
  status text not null check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  manifest_id uuid references world_knowledge_private.resolution_manifests(id) on delete restrict,
  error_code text
);

-- Deliberately unactivated exposed-schema projection. No client grant or policy is
-- created in Slice 3B; a later activation migration must make that decision.
create table public.world_knowledge_public_projection_v1 (
  spot_id uuid primary key references public.spots(id) on delete restrict,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  publication_state text not null check (publication_state in ('SHADOW','PUBLISHED')) default 'SHADOW',
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.world_knowledge_public_projection_v1 enable row level security;
revoke all on table public.world_knowledge_public_projection_v1 from public, anon, authenticated;
grant all on table public.world_knowledge_public_projection_v1 to service_role;

-- Private ledgers are not Data API surfaces. Discover every World Knowledge
-- relation from the catalog so a newly added table cannot fall out of the
-- defense-in-depth configuration through an incomplete hand-maintained list.
do $world_rls$
declare relation record;
begin
  for relation in
    select n.nspname as schema_name,c.relname as relation_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p')
      and (n.nspname='world_knowledge_private' or (n.nspname='public' and c.relname like 'world_knowledge_%'))
    order by n.nspname,c.relname
  loop
    execute format('alter table %I.%I enable row level security',relation.schema_name,relation.relation_name);
    execute format('revoke all on table %I.%I from public, anon, authenticated',relation.schema_name,relation.relation_name);
    execute format('grant all on table %I.%I to service_role',relation.schema_name,relation.relation_name);
  end loop;
end
$world_rls$;

create view world_knowledge_private.security_inventory_v1
with (security_invoker=true)
as
select
  n.nspname::text as schema_name,
  c.relname::text as object_name,
  case c.relkind when 'r' then 'TABLE' when 'p' then 'PARTITIONED_TABLE' when 'v' then 'VIEW' when 'm' then 'MATERIALIZED_VIEW' end::text as object_type,
  (n.nspname='public') as data_api_schema,
  case when c.relkind in ('r','p') then c.relrowsecurity else null end as rls_enabled,
  (pg_catalog.has_table_privilege('public',c.oid,'SELECT') or pg_catalog.has_table_privilege('public',c.oid,'INSERT') or pg_catalog.has_table_privilege('public',c.oid,'UPDATE') or pg_catalog.has_table_privilege('public',c.oid,'DELETE')) as public_dml,
  (pg_catalog.has_table_privilege('anon',c.oid,'SELECT') or pg_catalog.has_table_privilege('anon',c.oid,'INSERT') or pg_catalog.has_table_privilege('anon',c.oid,'UPDATE') or pg_catalog.has_table_privilege('anon',c.oid,'DELETE')) as anon_dml,
  (pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') or pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT') or pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE') or pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE')) as authenticated_dml,
  (pg_catalog.has_table_privilege('service_role',c.oid,'SELECT') and (c.relkind in ('v','m') or (pg_catalog.has_table_privilege('service_role',c.oid,'INSERT') and pg_catalog.has_table_privilege('service_role',c.oid,'UPDATE') and pg_catalog.has_table_privilege('service_role',c.oid,'DELETE')))) as service_role_access,
  coalesce((select jsonb_agg(p.polname order by p.polname) from pg_catalog.pg_policy p where p.polrelid=c.oid),'[]'::jsonb) as policies,
  case
    when n.nspname='public' then 'SERVICE_ROLE_SHADOW_ONLY'
    when c.relname in ('claims','source_references','verification_records','confirmation_records') then 'AUTHORIZED_SERVER_RPC_APPEND_ONLY'
    when c.relname='identity_events' then 'ADMIN_PREPARATORY_EVENT_ONLY'
    when c.relname in ('resolution_manifests','resolution_entries','current_projection_pointers','rebuild_jobs') then 'SERVICE_ROLE_SHADOW_RESOLVER'
    else 'SERVICE_ROLE_INTERNAL'
  end::text as expected_mutation_authority
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p','v','m')
  and (n.nspname='world_knowledge_private' or (n.nspname='public' and c.relname like 'world_knowledge_%'));
revoke all on world_knowledge_private.security_inventory_v1 from public,anon,authenticated;
grant select on world_knowledge_private.security_inventory_v1 to service_role;

insert into world_knowledge_private.registry_releases(registry_version,registry_hash,predecessor_version,change_class,definitions,release_hash,approved_at,created_at) values
('backyrd.world-knowledge.registry@1.0','eba49eab117007ce6f8fca5cc5114e615d6cf8fb1a32547465149db8c84e922b',null,'ADDITIVE_DEFINITION','[]',encode(extensions.digest(convert_to('registry-release:1.0','UTF8'),'sha256'),'hex'),'2026-09-10T11:01:01Z','2026-09-10T11:01:01Z'),
('backyrd.world-knowledge.registry@1.1','e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be','backyrd.world-knowledge.registry@1.0','ADDITIVE_DEFINITION','[]',encode(extensions.digest(convert_to('registry-release:1.1:e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be','UTF8'),'sha256'),'hex'),'2026-09-10T18:00:00Z','2026-09-10T18:00:00Z');

insert into world_knowledge_private.attribute_definitions(registry_version,attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization) values
('backyrd.world-knowledge.registry@1.1','identity.name','TEXT',null,1,160,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.address_line1','TEXT',null,1,240,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.locality','TEXT',null,1,120,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.neighborhood','TEXT',null,1,120,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.country_code','COUNTRY_CODE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.latitude','DECIMAL',null,-90,90,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.longitude','DECIMAL',null,-180,180,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','location.timezone','IANA_TIMEZONE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.website','URL',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.instagram','URL',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.facebook','URL',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.linkedin','URL',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.tiktok','URL',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.phone','PHONE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','contact.public_email','EMAIL',null,3,254,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','description.highlight','TEXT',null,1,800,'EXPLANATION_ONLY'),
('backyrd.world-knowledge.registry@1.1','classification.primary_category','ENUM','["EAT","DRINKS","COFFEE_DAYTIME","NIGHTLIFE","CULTURE_ARTS","ENTERTAINMENT","ACTIVITIES_PLAY","SPORT_MOVEMENT","OUTDOOR_NATURE","WELLNESS_RELAXATION","SHOPPING_MARKETS","STAY","COMMUNITY_SOCIAL","ATTRACTIONS_LANDMARKS","TEMPORARY_PLACES","OTHER"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','classification.place_types','ENUM_SET','["RESTAURANT","BRASSERIE","BISTRO","CAFE","BAR","PUB","SNACK_BAR","TAKEAWAY","FAST_FOOD"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','offering.cuisines','ENUM_SET','["ITALIAN","INDIAN","SWISS","FRENCH","JAPANESE","MEDITERRANEAN","ASIAN"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','offering.food_specialities','ENUM_SET','["PIZZA","BURGER","SUSHI"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','offering.groups','ENUM_SET','["BEER","WINE","COCKTAILS","NON_ALCOHOLIC_DRINKS","COFFEE","SNACKS","FULL_MEALS","BREAKFAST","BRUNCH","LUNCH","DINNER","TAKEAWAY_MEALS"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.price_range','MONEY_RANGE',null,0,100000,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.price_level','ENUM','["VERY_LOW","LOW","MEDIUM","HIGH","PREMIUM"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.payment_methods','ENUM_SET','["CASH","DEBIT_CARD","CREDIT_CARD","MOBILE_PAYMENT"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.takeaway','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.service_model','ENUM','["TABLE_SERVICE","SELF_SERVICE","HYBRID"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.service_format','ENUM','["CASUAL_DINING","FINE_DINING","FAST_CASUAL","COUNTER_SERVICE"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.laptop_policy','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','operation.stay_policy','ENUM','["ALLOWED","WITH_ACTIVE_CONSUMPTION","TIME_LIMITED","NOT_ALLOWED"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','capacity.seats_total','INTEGER',null,0,100000,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','capacity.seats_indoor','INTEGER',null,0,100000,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','capacity.seats_outdoor','INTEGER',null,0,100000,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','capacity.group_size_supported','INTEGER_RANGE',null,1,100000,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','rule.reservation','RESERVATION_RULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','rule.external_food','CONSUMPTION_RULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','rule.external_drink','CONSUMPTION_RULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','amenity.features','ENUM_SET','["WIFI","POWER_OUTLETS","TOILET","HIGH_CHAIR","STROLLER_SPACE","TERRACE","GARDEN","OUTDOOR_SEATING","WATER_BOWL","WORK_TABLES"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.step_free_entrance','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.wheelchair_paths','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.accessible_seating','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.accessible_toilet','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.accessible_outdoor','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.accessible_indoor','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','accessibility.elevator','BOOLEAN',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','rule.pet_access','PET_ACCESS_RULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','rule.age_access','AGE_ACCESS_RULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','hours.regular','WEEKLY_SCHEDULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','hours.special','SPECIAL_HOURS',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','hours.kitchen','WEEKLY_SCHEDULE',null,null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','state.current','CURRENT_STATE','["OPEN","CLOSED","TEMPORARILY_CLOSED","LIMITED","FULL","KITCHEN_CLOSED","AREA_CLOSED"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@1.1','research.subjective_fits','ENUM_SET','["AFTERWORK","ROMANTIC","SPONTANEOUS","BIRTHDAY","COZY"]',null,null,'EXPLANATION_ONLY');

insert into world_knowledge_private.attribute_definitions
select 'backyrd.world-knowledge.registry@1.0',attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization
from world_knowledge_private.attribute_definitions
where registry_version='backyrd.world-knowledge.registry@1.1'
  and attribute_key not in ('contact.public_email','operation.price_level','accessibility.elevator','accessibility.accessible_indoor');

update world_knowledge_private.registry_releases release
set definitions=(select jsonb_agg(to_jsonb(definition)-'registry_version' order by definition.attribute_key) from world_knowledge_private.attribute_definitions definition where definition.registry_version=release.registry_version);

insert into world_knowledge_private.source_policy_releases(policy_version,policy_hash,registry_version,registry_hash,policy,state,approved_at) values
('backyrd.world-knowledge.source-policy@3b.1','029582851b57914ce8f360e27dd7d6697fa6144cdf1febcf38d866290f4da95b','backyrd.world-knowledge.registry@1.1','e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be',jsonb_build_object('ownerMethod','OWNER_CONFIRMED','adminMethod','ADMIN_CONFIRMED','missing','ABSENT_NOT_FALSE','currentStateValidUntilRequired',true,'subjectiveFits','EXPLANATION_ONLY'),'ACCEPTED','2026-09-10T18:00:00Z');
insert into world_knowledge_private.source_policy_attribute_rules(policy_version,attribute_key,allowed_source_types,allowed_actor_types,source_reference_requirement,self_assertion_allowed,verification_process_ids,freshness_policy_ref,allowed_use_cases)
select 'backyrd.world-knowledge.source-policy@3b.1',attribute_key,
  case when attribute_key='research.subjective_fits' then array['USER_REPORT'] else array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'] end,
  case when attribute_key='research.subjective_fits' then array['PUBLIC_CONTRIBUTOR'] else array['VERIFIED_OWNER','ADMIN'] end,
  'REQUIRED',attribute_key<>'research.subjective_fits',
  case when attribute_key='research.subjective_fits' then '{}'::text[] else array['process:owner-confirmed','process:admin-confirmed'] end,
  case when attribute_key='state.current' then 'freshness:current-state:explicit-valid-until' when attribute_key='hours.special' then 'freshness:special-hours:date-bound' when attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed' else 'freshness:durable-until-contradicted' end,
  case when attribute_key like 'contact.%' then array['GENERAL_WORLD','EXPLANATION','RESEARCH']
       when attribute_key='description.highlight' or attribute_key='research.subjective_fits' then array['EXPLANATION','RESEARCH']
       when attribute_key like 'hours.%' or attribute_key='state.current' then array['GENERAL_WORLD','OPENING_HOURS_ELIGIBILITY','RESEARCH']
       when attribute_key in ('operation.price_level','operation.price_range') then array['GENERAL_WORLD','PRICE','RESEARCH']
       when attribute_key like 'accessibility.%' then array['GENERAL_WORLD','ACCESSIBILITY','HARD_CONSTRAINTS','RESEARCH']
       when attribute_key in ('operation.takeaway','rule.reservation','rule.external_food','rule.external_drink','rule.age_access','rule.pet_access') then array['GENERAL_WORLD','HARD_CONSTRAINTS','RESEARCH']
       else array['GENERAL_WORLD','DISCOVERY','RESEARCH'] end
from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@1.1';
insert into world_knowledge_private.entitlement_policy_releases(policy_version,policy_hash,registry_version,policy,state,approved_at) values
('backyrd.world-knowledge.entitlement-policy@3b.1','ba8032f09eafc0ac561f0fdab112b457aca84bf69c94c85c4ad34396c7649575','backyrd.world-knowledge.registry@1.1',jsonb_build_object('commercialInfluence','AUTHORING_SCOPE_ONLY'),'ACCEPTED','2026-09-10T18:00:00Z');

insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@3b.1','OWNER_BASIC',attribute_key from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@1.1' and attribute_key in
('identity.name','location.address_line1','location.locality','location.neighborhood','location.country_code','location.latitude','location.longitude','location.timezone','classification.primary_category','classification.place_types','contact.public_email','contact.website','contact.phone','contact.instagram','contact.facebook','contact.linkedin','contact.tiktok','description.highlight','operation.price_level','operation.payment_methods','operation.takeaway','operation.service_model','operation.service_format','offering.cuisines','offering.food_specialities','offering.groups','hours.regular','hours.special','hours.kitchen','state.current');
insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@3b.1','OWNER_PRO',attribute_key from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@1.1' and (engine_authorization='AUTHORIZED' or attribute_key='description.highlight') and attribute_key<>'operation.price_range';
insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@3b.1','ADMIN',attribute_key from world_knowledge_private.entitlement_attribute_rules where policy_version='backyrd.world-knowledge.entitlement-policy@3b.1' and actor_scope='OWNER_PRO';

insert into world_knowledge_private.governance_approval_records(registry_version,authority_class,authority_reference,approved_at,record_hash)
values('backyrd.world-knowledge.registry@1.1','PRODUCT_CTO','accepted:world-knowledge-slice-3b','2026-09-10T18:00:00Z',encode(extensions.digest(convert_to('slice3b:registry:approval','UTF8'),'sha256'),'hex'));

create or replace function world_knowledge_private.reject_immutable_mutation_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'world_knowledge_append_only' using errcode='55000';
end $$;

create or replace function world_knowledge_private.detach_actor_binding_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.actor_id is not null and new.actor_id is null
     and new.id=old.id and new.actor_type=old.actor_type and new.created_at=old.created_at then
    new.actor_pseudonym_id:=gen_random_uuid();
    new.detached_at:=pg_catalog.clock_timestamp();
    return new;
  end if;
  raise exception 'actor_binding_mutation_forbidden' using errcode='55000';
end $$;

create trigger world_actor_binding_detach
before update on world_knowledge_private.actor_bindings
for each row execute function world_knowledge_private.detach_actor_binding_v1();
create trigger world_actor_binding_delete_forbidden
before delete on world_knowledge_private.actor_bindings
for each row execute function world_knowledge_private.reject_immutable_mutation_v1();

create or replace function public.world_confirm_claim_v1(p_claim_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid();
  actor_type text;
  binding_id uuid;
  claim world_knowledge_private.claims%rowtype;
  record_id uuid;
  confirmed_at_value timestamptz:=pg_catalog.clock_timestamp();
  confirmation_due_at_value timestamptz;
  method text;
  reconfirmation_ref text:='confirmation:quarterly-request-v1';
  v_record_hash text;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into claim from world_knowledge_private.claims where id=p_claim_id;
  if not found then raise exception 'claim_not_found' using errcode='22023'; end if;
  if public.is_admin_v1(actor_id) then actor_type:='ADMIN';
  elsif exists(select 1 from public.spots where id=claim.spot_id and owner_id=actor_id) then actor_type:='VERIFIED_OWNER';
  else raise exception 'confirmation_scope_denied' using errcode='42501'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,actor_type);
  method:=case when actor_type='ADMIN' then 'ADMIN_CONFIRMED' else 'OWNER_CONFIRMED' end;
  select id into record_id from world_knowledge_private.confirmation_records c where c.actor_binding_id=binding_id and c.idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from world_knowledge_private.confirmation_records c where c.id=record_id and c.claim_id=claim.id and c.claim_hash=claim.content_hash) then raise exception 'confirmation_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('confirmationId',record_id,'created',false,'claimUnchanged',true);
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_confirmation_idempotency' using errcode='22023'; end if;
  confirmation_due_at_value:=confirmed_at_value+interval '3 months';
  v_record_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'claimId',claim.id,'claimHash',claim.content_hash,'actorBinding',binding_id,'confirmationMethod',method,
    'confirmedAt',confirmed_at_value,'confirmationDueAt',confirmation_due_at_value,'policyVersion',claim.policy_version,
    'reconfirmationPolicyRef',reconfirmation_ref,'idempotencyIdentity',p_idempotency_key
  )::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.confirmation_records(claim_id,claim_hash,actor_binding_id,confirmation_method,policy_version,reconfirmation_policy_ref,confirmed_at,confirmation_due_at,idempotency_key,record_hash)
  values(claim.id,claim.content_hash,binding_id,method,claim.policy_version,reconfirmation_ref,confirmed_at_value,confirmation_due_at_value,p_idempotency_key,v_record_hash) returning id into record_id;
  return jsonb_build_object('confirmationId',record_id,'created',true,'claimUnchanged',true);
end $$;

create or replace function public.world_submit_user_report_v1(p_spot_id uuid,p_attribute_key text,p_report jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); binding_id uuid; work_id uuid; v_event_hash text;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.spots where id=p_spot_id) or not exists(select 1 from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@1.1' and attribute_key=p_attribute_key) then raise exception 'invalid_report_target' using errcode='22023'; end if;
  if jsonb_typeof(p_report)<>'object' or length(p_report::text)>4000 or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_report_payload' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'PUBLIC_CONTRIBUTOR');
  v_event_hash:=encode(extensions.digest(pg_catalog.convert_to(actor_id::text||':'||p_spot_id::text||':'||p_idempotency_key,'UTF8'),'sha256'),'hex');
  select work_item_id into work_id from world_knowledge_private.review_work_item_events e where e.event_hash=v_event_hash;
  if found then return jsonb_build_object('workItemId',work_id,'created',false,'factChanged',false); end if;
  insert into world_knowledge_private.review_work_items(spot_id,work_class,priority,attribute_key,candidate_payload,reporter_binding_id,reason_codes)
  values(p_spot_id,'USER_REPORT','NORMAL',p_attribute_key,p_report,binding_id,array['USER_REPORT_REQUIRES_ADMIN_REVIEW']) returning id into work_id;
  insert into world_knowledge_private.review_work_item_events(work_item_id,event_type,actor_binding_id,detail,event_hash) values(work_id,'CREATED',binding_id,'{}',v_event_hash);
  return jsonb_build_object('workItemId',work_id,'created',true,'factChanged',false);
end $$;

create or replace function public.world_admin_record_identity_event_v1(p_event_type text,p_subject_spot_id uuid,p_related_spot_id uuid,p_external_namespace text,p_external_reference_hash text,p_reason_codes text[],p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); binding_id uuid; event_id uuid; v_event_hash text;
begin
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_event_type not in ('DUPLICATE_SUSPECTED','MERGE_PROPOSED') then raise exception 'IDENTITY_OPERATION_AUTHORITY_NOT_CONFIGURED' using errcode='42501'; end if;
  if p_related_spot_id is null or p_subject_spot_id=p_related_spot_id or not exists(select 1 from public.spots s where s.id=p_subject_spot_id) or not exists(select 1 from public.spots s where s.id=p_related_spot_id) then raise exception 'invalid_identity_event_pair' using errcode='22023'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 or coalesce(pg_catalog.array_length(p_reason_codes,1),0)=0 then raise exception 'invalid_identity_event_metadata' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'ADMIN');
  v_event_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('eventType',p_event_type,'subjectSpotId',p_subject_spot_id,'relatedSpotId',p_related_spot_id,'externalNamespace',p_external_namespace,'externalReferenceHash',p_external_reference_hash,'recordedByBinding',binding_id,'reasonCodes',to_jsonb(p_reason_codes),'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  select id into event_id from world_knowledge_private.identity_events e where e.recorded_by_binding_id=binding_id and e.idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from world_knowledge_private.identity_events e where e.id=event_id and e.event_hash=v_event_hash) then raise exception 'identity_event_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('identityEventId',event_id,'created',false,'automaticMerge',false);
  end if;
  insert into world_knowledge_private.identity_events(event_type,subject_spot_id,related_spot_id,external_namespace,external_reference_hash,authority_record_id,recorded_by_binding_id,idempotency_key,occurred_at,reason_codes,event_hash)
  values(p_event_type,p_subject_spot_id,p_related_spot_id,p_external_namespace,p_external_reference_hash,null,binding_id,p_idempotency_key,pg_catalog.clock_timestamp(),p_reason_codes,v_event_hash) returning id into event_id;
  return jsonb_build_object('identityEventId',event_id,'created',true,'automaticMerge',false);
end $$;

create or replace function public.world_shadow_rebuild_spot_v1(p_spot_id uuid,p_as_of timestamptz,p_mode text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_input_hash text; v_resolution_hash text; v_manifest_hash text; manifest_id uuid; snapshot jsonb; decision jsonb;
begin
  if p_mode not in ('FULL','INCREMENTAL') or p_as_of is null or p_as_of>pg_catalog.clock_timestamp()+interval '60 seconds' then raise exception 'invalid_rebuild_request' using errcode='22023'; end if;
  if not exists(select 1 from public.spots s where s.id=p_spot_id and s.data_origin in ('TEST','FIXTURE')) and not exists(select 1 from world_knowledge_private.shadow_spot_allowlist a where a.spot_id=p_spot_id and a.valid_until>pg_catalog.clock_timestamp()) then raise exception 'shadow_spot_not_allowlisted' using errcode='42501'; end if;
  select encode(extensions.digest(pg_catalog.convert_to(coalesce(string_agg(c.content_hash,',' order by c.content_hash),'')||':backyrd.world-knowledge.registry@1.1:backyrd.world-knowledge.source-policy@3b.1:'||p_as_of::text,'UTF8'),'sha256'),'hex') into v_input_hash from world_knowledge_private.claims c where c.spot_id=p_spot_id and c.observed_at<=p_as_of;
  with eligible as (
    select c.*,v.verification_method,row_number() over(partition by c.attribute_key,c.scope order by c.last_changed_at desc,c.id desc) rn,
      count(*) over(partition by c.attribute_key,c.scope,c.last_changed_at) same_time
    from world_knowledge_private.claims c
    join world_knowledge_private.verification_records v on v.claim_id=c.id and v.claim_hash=c.content_hash and v.result='VERIFIED'
    join world_knowledge_private.source_policy_attribute_rules policy on policy.policy_version=c.policy_version and policy.attribute_key=c.attribute_key
      and c.source_type=any(policy.allowed_source_types) and c.actor_type=any(policy.allowed_actor_types)
      and c.source_reference_id is not null and 'GENERAL_WORLD'=any(policy.allowed_use_cases)
      and ((v.verification_method='OWNER_CONFIRMED' and 'process:owner-confirmed'=any(policy.verification_process_ids)) or (v.verification_method='ADMIN_CONFIRMED' and 'process:admin-confirmed'=any(policy.verification_process_ids)))
    where c.spot_id=p_spot_id and c.observed_at<=p_as_of and c.visibility<>'SHADOW_HELD' and (c.valid_from is null or c.valid_from<=p_as_of) and (c.valid_until is null or c.valid_until>p_as_of)
  ), resolved as (
    select e.attribute_key,e.scope,case when e.same_time>1 then 'DISPUTED' else e.knowledge_state end resolution,case when e.same_time>1 then null else e.value end value,case when e.same_time>1 then 'CONFLICTING' else 'VERIFIED' end trust,'CURRENT' freshness,
      array(select e2.content_hash from eligible e2 where e2.attribute_key=e.attribute_key and e2.scope=e.scope and e2.last_changed_at=e.last_changed_at order by e2.content_hash) basis_hashes,e.same_time
    from eligible e where e.rn=1
  )
  select jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.shadow-snapshot@1.0','registryVersion','backyrd.world-knowledge.registry@1.1','registryHash','e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be','policyVersion','backyrd.world-knowledge.source-policy@3b.1','spotId',p_spot_id,'resolvedAt',p_as_of,
    'facts',coalesce(jsonb_agg(jsonb_build_object('key',attribute_key,'scope',scope,'resolution',resolution,'value',value,'trust',trust,'freshness',freshness,'basisClaimHashes',basis_hashes) order by attribute_key,scope),'[]'::jsonb),
    'explicitUnknowns',coalesce(jsonb_agg(jsonb_build_object('key',attribute_key,'scope',scope) order by attribute_key,scope) filter(where resolution='UNKNOWN'),'[]'::jsonb),
    'conflicts',coalesce(jsonb_agg(jsonb_build_object('key',attribute_key,'scope',scope,'claimHashes',basis_hashes) order by attribute_key,scope) filter(where resolution='DISPUTED'),'[]'::jsonb)
  ) into snapshot from resolved;
  -- Public contact is World information; Decision projection deliberately omits every contact key.
  select jsonb_build_object('contractVersion','backyrd.world-knowledge.shadow-decision-projection@1.0','spotId',p_spot_id,'registryVersion',snapshot->>'registryVersion','policyVersion',snapshot->>'policyVersion','facts',coalesce(jsonb_agg(item order by item->>'key') filter(where item->>'key' not like 'contact.%' and item->>'key'<>'description.highlight'),'[]'::jsonb),'explicitUnknowns',snapshot->'explicitUnknowns','conflicts',snapshot->'conflicts') into decision from jsonb_array_elements(snapshot->'facts') item;
  v_resolution_hash:=encode(extensions.digest(pg_catalog.convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
  v_manifest_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',p_spot_id,'registryVersion','backyrd.world-knowledge.registry@1.1','policyVersion','backyrd.world-knowledge.source-policy@3b.1','asOf',p_as_of,'inputHash',v_input_hash,'resolutionHash',v_resolution_hash)::text,'UTF8'),'sha256'),'hex');
  select m.id into manifest_id from world_knowledge_private.resolution_manifests m where m.spot_id=p_spot_id and m.registry_version='backyrd.world-knowledge.registry@1.1' and m.policy_version='backyrd.world-knowledge.source-policy@3b.1' and m.input_hash=v_input_hash;
  if not found then
    insert into world_knowledge_private.resolution_manifests(spot_id,registry_version,policy_version,as_of,input_hash,resolution_hash,manifest_hash,world_snapshot,decision_projection) values(p_spot_id,'backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.source-policy@3b.1',p_as_of,v_input_hash,v_resolution_hash,v_manifest_hash,snapshot,decision) returning id into manifest_id;
    insert into world_knowledge_private.resolution_entries(manifest_id,attribute_key,scope,resolution,value,trust,freshness,basis_claim_hashes,conflict_claim_hashes,entry_hash)
    select manifest_id,item->>'key',item->>'scope',item->>'resolution',item->'value',item->>'trust',item->>'freshness',array(select jsonb_array_elements_text(item->'basisClaimHashes')),case when item->>'resolution'='DISPUTED' then array(select jsonb_array_elements_text(item->'basisClaimHashes')) else '{}' end,encode(extensions.digest(pg_catalog.convert_to(item::text,'UTF8'),'sha256'),'hex') from jsonb_array_elements(snapshot->'facts') item;
  end if;
  insert into world_knowledge_private.current_projection_pointers(spot_id,manifest_id) values(p_spot_id,manifest_id) on conflict(spot_id) do update set manifest_id=excluded.manifest_id,updated_at=pg_catalog.clock_timestamp();
  insert into world_knowledge_private.rebuild_jobs(spot_id,idempotency_key,mode,status,completed_at,manifest_id) values(p_spot_id,p_idempotency_key,p_mode,'SUCCEEDED',pg_catalog.clock_timestamp(),manifest_id) on conflict(idempotency_key) do nothing;
  return jsonb_build_object('manifestId',manifest_id,'manifestHash',v_manifest_hash,'resolutionHash',v_resolution_hash,'inputHash',v_input_hash,'mode',p_mode,'worldSnapshot',snapshot,'decisionProjection',decision);
end $$;

comment on schema world_knowledge_private is 'Slice 3B private, append-only World Knowledge ledger and shadow resolver internals; not a Data API surface.';
comment on table public.world_knowledge_public_projection_v1 is 'Unactivated Slice 3B projection surface. No anon/authenticated grants or RLS policies exist until a separately authorized runtime activation.';
comment on column world_knowledge_private.entitlement_policy_releases.policy is 'Subscription controls authoring scope only and must never enter World resolution, Decision eligibility or ranking.';

do $immutable$
declare table_name text;
begin
  foreach table_name in array array['registry_releases','governance_approval_records','attribute_definitions','source_policy_releases','source_policy_attribute_rules','entitlement_policy_releases','entitlement_attribute_rules','source_references','claims','verification_records','confirmation_records','identity_events','resolution_manifests','resolution_entries','review_work_item_events'] loop
    execute format('create trigger %I before update or delete on world_knowledge_private.%I for each row execute function world_knowledge_private.reject_immutable_mutation_v1()', 'world_immutable_'||table_name, table_name);
  end loop;
end
$immutable$;

create or replace function world_knowledge_private.attribute_value_valid_v1(p_registry_version text,p_attribute_key text,p_state text,p_value jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare definition world_knowledge_private.attribute_definitions%rowtype; item jsonb; nested jsonb;
begin
  select * into definition from world_knowledge_private.attribute_definitions where registry_version=p_registry_version and attribute_key=p_attribute_key;
  if not found or p_state not in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE','UNKNOWN') then return false; end if;
  if p_state='UNKNOWN' then return p_value is null; end if;
  if p_value is null then return false; end if;
  if p_state='KNOWN_TRUE' and (definition.value_type<>'BOOLEAN' or p_value<>'true'::jsonb) then return false; end if;
  if p_state='KNOWN_FALSE' and (definition.value_type<>'BOOLEAN' or p_value<>'false'::jsonb) then return false; end if;
  if definition.value_type='BOOLEAN' then return jsonb_typeof(p_value)='boolean'; end if;
  if definition.value_type in ('TEXT','EMAIL','URL','PHONE','COUNTRY_CODE','IANA_TIMEZONE','ENUM') and jsonb_typeof(p_value)<>'string' then return false; end if;
  if definition.value_type='EMAIL' and trim(both '"' from p_value::text) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return false; end if;
  if definition.value_type='URL' and trim(both '"' from p_value::text) !~ '^https?://' then return false; end if;
  if definition.value_type='PHONE' and trim(both '"' from p_value::text) !~ '^\+[1-9][0-9]{6,14}$' then return false; end if;
  if definition.value_type='COUNTRY_CODE' and trim(both '"' from p_value::text) !~ '^[A-Z]{2}$' then return false; end if;
  if definition.value_type='IANA_TIMEZONE' and not exists(select 1 from pg_catalog.pg_timezone_names() zone where zone.name=p_value#>>'{}') then return false; end if;
  if definition.value_type in ('TEXT','EMAIL') and (length(p_value#>>'{}')<coalesce(definition.minimum,0) or length(p_value#>>'{}')>coalesce(definition.maximum,100000)) then return false; end if;
  if definition.value_type='ENUM' and not definition.allowed_values @> jsonb_build_array(p_value#>>'{}') then return false; end if;
  if definition.value_type='ENUM_SET' then
    if jsonb_typeof(p_value)<>'array' then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop if jsonb_typeof(item)<>'string' or not definition.allowed_values @> jsonb_build_array(item#>>'{}') then return false; end if; end loop;
  end if;
  if definition.value_type in ('DECIMAL','INTEGER') then
    if jsonb_typeof(p_value)<>'number' then return false; end if;
    if definition.value_type='INTEGER' and (p_value#>>'{}')::numeric<>trunc((p_value#>>'{}')::numeric) then return false; end if;
    if definition.minimum is not null and (p_value#>>'{}')::numeric<definition.minimum or definition.maximum is not null and (p_value#>>'{}')::numeric>definition.maximum then return false; end if;
  end if;
  if definition.value_type='INTEGER_RANGE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>2 or not p_value ?& array['min','max'] or jsonb_typeof(p_value->'min')<>'number' or jsonb_typeof(p_value->'max')<>'number' or (p_value->>'min')::numeric<>trunc((p_value->>'min')::numeric) or (p_value->>'max')::numeric<>trunc((p_value->>'max')::numeric) or (p_value->>'min')::numeric>(p_value->>'max')::numeric or (p_value->>'min')::numeric<definition.minimum or (p_value->>'max')::numeric>definition.maximum) then return false; end if;
  if definition.value_type='MONEY_RANGE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>3 or not p_value ?& array['currency','min','max'] or p_value->>'currency' !~ '^[A-Z]{3}$' or jsonb_typeof(p_value->'min')<>'number' or jsonb_typeof(p_value->'max')<>'number' or (p_value->>'min')::numeric>(p_value->>'max')::numeric or (p_value->>'min')::numeric<definition.minimum or (p_value->>'max')::numeric>definition.maximum) then return false; end if;
  if definition.value_type in ('WEEKLY_SCHEDULE','SPECIAL_HOURS') then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when definition.value_type='WEEKLY_SCHEDULE' then 7 else 366 end) then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>(case when definition.value_type='WEEKLY_SCHEDULE' then 2 else 3 end) or not item ? 'intervals' or jsonb_typeof(item->'intervals')<>'array' or jsonb_array_length(item->'intervals')>8 then return false; end if;
      if definition.value_type='WEEKLY_SCHEDULE' and coalesce(item->>'day','') not in ('MON','TUE','WED','THU','FRI','SAT','SUN') then return false; end if;
      if definition.value_type='SPECIAL_HOURS' and (coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(item->>'status','') not in ('OPEN','CLOSED') or (item->>'status'='CLOSED' and jsonb_array_length(item->'intervals')<>0) or (item->>'status'='OPEN' and jsonb_array_length(item->'intervals')=0)) then return false; end if;
      for nested in select value from jsonb_array_elements(item->'intervals') loop if jsonb_typeof(nested)<>'object' or (select count(*) from jsonb_object_keys(nested))<>2 or coalesce(nested->>'from','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(nested->>'to','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if; end loop;
    end loop;
    if definition.value_type='WEEKLY_SCHEDULE' and (select count(*)<>count(distinct value->>'day') from jsonb_array_elements(p_value)) then return false; end if;
    if definition.value_type='SPECIAL_HOURS' and (select count(*)<>count(distinct value->>'date') from jsonb_array_elements(p_value)) then return false; end if;
  end if;
  if definition.value_type='RESERVATION_RULE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>5 or not p_value ?& array['mode','minimumPartySize','days','fromTime','toTime'] or coalesce(p_value->>'mode','') not in ('NOT_REQUIRED','RECOMMENDED','REQUIRED','CONDITIONAL') or jsonb_typeof(p_value->'days')<>'array' or ((p_value->'fromTime') is null)<>(p_value->'toTime' is null)) then return false; end if;
  if definition.value_type='CONSUMPTION_RULE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>2 or not p_value ?& array['policy','exceptions'] or coalesce(p_value->>'policy','') not in ('ALLOWED','NOT_ALLOWED','BYO_FEE','CONDITIONAL') or jsonb_typeof(p_value->'exceptions')<>'array') then return false; end if;
  if definition.value_type='PET_ACCESS_RULE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>4 or not p_value ?& array['indoor','outdoor','assistanceAnimals','notes'] or coalesce(p_value->>'indoor','') not in ('ALLOWED','NOT_ALLOWED','CONDITIONAL','UNKNOWN') or coalesce(p_value->>'outdoor','') not in ('ALLOWED','NOT_ALLOWED','CONDITIONAL','UNKNOWN') or coalesce(p_value->>'assistanceAnimals','') not in ('ALLOWED','NOT_ALLOWED','CONDITIONAL','UNKNOWN')) then return false; end if;
  if definition.value_type='AGE_ACCESS_RULE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>3 or not p_value ?& array['policy','minimumAge','appliesFromTime'] or coalesce(p_value->>'policy','') not in ('ALL_AGES','MINIMUM_AGE') or (p_value->>'policy'='ALL_AGES' and (p_value->'minimumAge'<>'null'::jsonb or p_value->'appliesFromTime'<>'null'::jsonb)) or (p_value->>'policy'='MINIMUM_AGE' and (jsonb_typeof(p_value->'minimumAge')<>'number' or (p_value->>'minimumAge')::numeric not between 0 and 120))) then return false; end if;
  if definition.value_type='CURRENT_STATE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>2 or not (p_value ?& array['kind','scope']) or not definition.allowed_values @> jsonb_build_array(p_value->>'kind') or coalesce(p_value->>'scope','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') then return false; end if;
  return true;
exception when others then return false;
end $$;

create or replace function world_knowledge_private.text_requires_shadow_v1(p_attribute_key text,p_value jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_attribute_key='description.highlight' and coalesce(p_value#>>'{}','') ~* '(rassist|nazi|hate|hass|kill|illegal|verboten)';
$$;

create or replace function world_knowledge_private.validate_claim_insert_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare expected_hash text;
begin
  if not world_knowledge_private.attribute_value_valid_v1(new.registry_version,new.attribute_key,new.knowledge_state,new.value) then raise exception 'invalid_attribute_value' using errcode='22023'; end if;
  if new.attribute_key='state.current' and new.valid_until is null then raise exception 'current_state_valid_until_required' using errcode='22023'; end if;
  if new.supersedes_claim_id is not null and not exists(select 1 from world_knowledge_private.claims prior where prior.id=new.supersedes_claim_id and prior.spot_id=new.spot_id and prior.attribute_key=new.attribute_key and prior.scope=new.scope) then raise exception 'invalid_supersedes_claim' using errcode='22023'; end if;
  expected_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',new.spot_id,'key',new.attribute_key,'state',new.knowledge_state,'value',new.value,'actorBinding',new.actor_binding_id,'observedAt',new.observed_at,'validFrom',new.valid_from,'validUntil',new.valid_until,'supersedes',new.supersedes_claim_id,'registry',new.registry_version,'policy',new.policy_version)::text,'UTF8'),'sha256'),'hex');
  if new.content_hash<>expected_hash then raise exception 'claim_content_hash_mismatch' using errcode='22023'; end if;
  return new;
end $$;
create trigger world_validate_claim_insert before insert on world_knowledge_private.claims for each row execute function world_knowledge_private.validate_claim_insert_v1();

create or replace function world_knowledge_private.validate_verification_insert_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  claim world_knowledge_private.claims%rowtype;
  binding world_knowledge_private.actor_bindings%rowtype;
  expected_freshness_ref text;
  expected_hash text;
begin
  select * into claim from world_knowledge_private.claims where id=new.claim_id;
  select * into binding from world_knowledge_private.actor_bindings where id=new.verifier_binding_id;
  if claim.id is null or binding.id is null or new.claim_hash<>claim.content_hash or new.spot_id<>claim.spot_id or new.attribute_key<>claim.attribute_key or new.scope<>claim.scope or new.policy_version<>claim.policy_version or new.checked_at<claim.observed_at or new.checked_at>pg_catalog.clock_timestamp()+interval '60 seconds' then raise exception 'verification_binding_invalid' using errcode='22023'; end if;
  expected_freshness_ref:=case when claim.attribute_key='state.current' then 'freshness:current-state:explicit-valid-until' when claim.attribute_key='hours.special' then 'freshness:special-hours:date-bound' when claim.attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed' else 'freshness:durable-until-contradicted' end;
  if new.reverification_policy_ref<>expected_freshness_ref or new.reason_codes<>array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[] or new.result<>'VERIFIED' then raise exception 'verification_policy_binding_invalid' using errcode='22023'; end if;
  if new.verification_method='OWNER_CONFIRMED' then
    if new.execution_authority<>'SERVER_BOUND_OWNER_WRITE' or binding.actor_type<>'VERIFIED_OWNER' or binding.actor_id is null or claim.actor_type<>'VERIFIED_OWNER' or claim.actor_binding_id<>binding.id or not exists(select 1 from public.spots s where s.id=claim.spot_id and s.owner_id=binding.actor_id) then raise exception 'verification_authority_invalid' using errcode='42501'; end if;
  elsif new.verification_method='ADMIN_CONFIRMED' then
    if new.execution_authority<>'SERVER_BOUND_ADMIN_WRITE' or binding.actor_type<>'ADMIN' or binding.actor_id is null or claim.actor_type<>'ADMIN' or claim.actor_binding_id<>binding.id or not public.is_admin_v1(binding.actor_id) then raise exception 'verification_authority_invalid' using errcode='42501'; end if;
  else
    raise exception 'independent_process_authority_not_configured' using errcode='42501';
  end if;
  if claim.source_type='AI_INFERENCE' and new.result='VERIFIED' then raise exception 'ai_cannot_self_verify' using errcode='42501'; end if;
  expected_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('claimId',new.claim_id,'claimHash',new.claim_hash,'spotId',new.spot_id,'attributeKey',new.attribute_key,'scope',new.scope,'policyVersion',new.policy_version,'method',new.verification_method,'authority',new.execution_authority,'verifierBinding',new.verifier_binding_id,'result',new.result,'checkedAt',new.checked_at,'reverificationPolicyRef',new.reverification_policy_ref,'reasonCodes',to_jsonb(new.reason_codes))::text,'UTF8'),'sha256'),'hex');
  if new.result_hash<>expected_hash then raise exception 'verification_result_hash_mismatch' using errcode='22023'; end if;
  return new;
end $$;
create trigger world_validate_verification_insert before insert on world_knowledge_private.verification_records for each row execute function world_knowledge_private.validate_verification_insert_v1();

create or replace function world_knowledge_private.validate_confirmation_insert_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  claim world_knowledge_private.claims%rowtype;
  binding world_knowledge_private.actor_bindings%rowtype;
  expected_hash text;
begin
  select * into claim from world_knowledge_private.claims where id=new.claim_id;
  select * into binding from world_knowledge_private.actor_bindings where id=new.actor_binding_id;
  if claim.id is null or binding.id is null or new.claim_hash<>claim.content_hash or new.policy_version<>claim.policy_version or new.confirmed_at<claim.observed_at or new.confirmed_at>pg_catalog.clock_timestamp()+interval '60 seconds' or new.confirmation_due_at<>new.confirmed_at+interval '3 months' or new.reconfirmation_policy_ref<>'confirmation:quarterly-request-v1' or length(trim(coalesce(new.idempotency_key,''))) not between 1 and 180 then raise exception 'confirmation_binding_invalid' using errcode='22023'; end if;
  if new.confirmation_method='OWNER_CONFIRMED' then
    if binding.actor_type<>'VERIFIED_OWNER' or binding.actor_id is null or claim.actor_type<>'VERIFIED_OWNER' or claim.actor_binding_id<>binding.id or not exists(select 1 from public.spots s where s.id=claim.spot_id and s.owner_id=binding.actor_id) then raise exception 'confirmation_authority_invalid' using errcode='42501'; end if;
  elsif new.confirmation_method='ADMIN_CONFIRMED' then
    if binding.actor_type<>'ADMIN' or binding.actor_id is null or not public.is_admin_v1(binding.actor_id) then raise exception 'confirmation_authority_invalid' using errcode='42501'; end if;
  else
    raise exception 'confirmation_authority_invalid' using errcode='42501';
  end if;
  expected_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'claimId',new.claim_id,'claimHash',new.claim_hash,'actorBinding',new.actor_binding_id,'confirmationMethod',new.confirmation_method,
    'confirmedAt',new.confirmed_at,'confirmationDueAt',new.confirmation_due_at,'policyVersion',new.policy_version,
    'reconfirmationPolicyRef',new.reconfirmation_policy_ref,'idempotencyIdentity',new.idempotency_key
  )::text,'UTF8'),'sha256'),'hex');
  if new.record_hash<>expected_hash then raise exception 'confirmation_record_hash_mismatch' using errcode='22023'; end if;
  return new;
end $$;
create trigger world_validate_confirmation_insert before insert on world_knowledge_private.confirmation_records for each row execute function world_knowledge_private.validate_confirmation_insert_v1();

create or replace function world_knowledge_private.get_actor_binding_v1(p_actor_id uuid,p_actor_type text)
returns uuid language plpgsql security definer set search_path='' as $$
declare binding_id uuid;
begin
  if p_actor_id is null or p_actor_type not in ('VERIFIED_OWNER','ADMIN','SYSTEM','PUBLIC_CONTRIBUTOR') then raise exception 'invalid_actor_binding' using errcode='22023'; end if;
  select id into binding_id from world_knowledge_private.actor_bindings where actor_id=p_actor_id and actor_type=p_actor_type;
  if found then return binding_id; end if;
  insert into world_knowledge_private.actor_bindings(actor_id,actor_type)
  values(p_actor_id,p_actor_type) returning id into binding_id;
  return binding_id;
end $$;

create or replace function world_knowledge_private.submit_authoritative_claim_v1(
  p_actor_type text,p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,p_observed_at timestamptz,p_valid_from timestamptz,p_valid_until timestamptz,p_visibility text,p_supersedes_claim_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); entitlement_scope text; binding_id uuid; source_id uuid; v_claim_id uuid; content_hash text; method text; authority text; prior world_knowledge_private.claims%rowtype; shadow_hold boolean;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_actor_type='VERIFIED_OWNER' then
    if not exists(select 1 from public.spots where id=p_spot_id and owner_id=actor_id) then raise exception 'spot_owner_required' using errcode='42501'; end if;
    entitlement_scope:=case when exists(select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1 where spot_id=p_spot_id and owner_id=actor_id and tier='PREMIUM' and valid_from<=pg_catalog.clock_timestamp() and (valid_until is null or valid_until>pg_catalog.clock_timestamp())) then 'OWNER_PRO' else 'OWNER_BASIC' end;
    method:='OWNER_CONFIRMED'; authority:='SERVER_BOUND_OWNER_WRITE';
  elsif p_actor_type='ADMIN' then
    if not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
    entitlement_scope:='ADMIN'; method:='ADMIN_CONFIRMED'; authority:='SERVER_BOUND_ADMIN_WRITE';
  else raise exception 'invalid_authoritative_actor' using errcode='22023';
  end if;
  if not exists(select 1 from world_knowledge_private.entitlement_attribute_rules where policy_version='backyrd.world-knowledge.entitlement-policy@3b.1' and actor_scope=entitlement_scope and attribute_key=p_attribute_key) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  if p_observed_at is null or p_observed_at>pg_catalog.clock_timestamp()+interval '60 seconds' then raise exception 'invalid_observed_at' using errcode='22023'; end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from then raise exception 'invalid_validity_window' using errcode='22023'; end if;
  if p_attribute_key='state.current' and p_valid_until is null then raise exception 'current_state_valid_until_required' using errcode='22023'; end if;
  if p_visibility not in ('PUBLIC','INTERNAL') or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_claim_metadata' using errcode='22023'; end if;
  if not world_knowledge_private.attribute_value_valid_v1('backyrd.world-knowledge.registry@1.1',p_attribute_key,p_knowledge_state,p_value) then raise exception 'invalid_attribute_value' using errcode='22023'; end if;
  if p_supersedes_claim_id is not null then select * into prior from world_knowledge_private.claims where id=p_supersedes_claim_id; if not found or prior.spot_id<>p_spot_id or prior.attribute_key<>p_attribute_key then raise exception 'invalid_supersedes_claim' using errcode='22023'; end if; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,p_actor_type);
  content_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',p_spot_id,'key',p_attribute_key,'state',p_knowledge_state,'value',p_value,'actorBinding',binding_id,'observedAt',p_observed_at,'validFrom',p_valid_from,'validUntil',p_valid_until,'supersedes',p_supersedes_claim_id,'registry','backyrd.world-knowledge.registry@1.1','policy','backyrd.world-knowledge.source-policy@3b.1')::text,'UTF8'),'sha256'),'hex');
  select id into v_claim_id from world_knowledge_private.claims where actor_binding_id=binding_id and idempotency_key=p_idempotency_key;
  if found then if (select c.content_hash from world_knowledge_private.claims c where c.id=v_claim_id)<>content_hash then raise exception 'claim_idempotency_conflict' using errcode='23505'; end if; return jsonb_build_object('claimId',v_claim_id,'created',false); end if;
  insert into world_knowledge_private.source_references(spot_id,source_type,visibility,source_hash)
  values(p_spot_id,case when p_actor_type='ADMIN' then 'ADMIN_OBSERVATION' else 'OWNER_ASSERTION' end,'INTERNAL',encode(extensions.digest(pg_catalog.convert_to(binding_id::text||':'||p_idempotency_key,'UTF8'),'sha256'),'hex')) returning id into source_id;
  shadow_hold:=world_knowledge_private.text_requires_shadow_v1(p_attribute_key,p_value);
  insert into world_knowledge_private.claims(idempotency_key,spot_id,registry_version,policy_version,attribute_key,knowledge_state,value,actor_binding_id,actor_type,source_reference_id,source_type,observed_at,valid_from,valid_until,last_changed_at,stance,visibility,supersedes_claim_id,content_hash)
  values(p_idempotency_key,p_spot_id,'backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.source-policy@3b.1',p_attribute_key,p_knowledge_state,p_value,binding_id,p_actor_type,source_id,case when p_actor_type='ADMIN' then 'ADMIN_OBSERVATION' else 'OWNER_ASSERTION' end,p_observed_at,p_valid_from,p_valid_until,pg_catalog.clock_timestamp(),'SUPPORTS',case when shadow_hold then 'SHADOW_HELD' else p_visibility end,p_supersedes_claim_id,content_hash) returning id into v_claim_id;
  declare
    checked_at_value timestamptz:=pg_catalog.clock_timestamp();
    freshness_ref text:=case when p_attribute_key='state.current' then 'freshness:current-state:explicit-valid-until' when p_attribute_key='hours.special' then 'freshness:special-hours:date-bound' when p_attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed' else 'freshness:durable-until-contradicted' end;
    reason_values text[]:=array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'];
    verification_hash text;
  begin
    verification_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('claimId',v_claim_id,'claimHash',content_hash,'spotId',p_spot_id,'attributeKey',p_attribute_key,'scope','SPOT','policyVersion','backyrd.world-knowledge.source-policy@3b.1','method',method,'authority',authority,'verifierBinding',binding_id,'result','VERIFIED','checkedAt',checked_at_value,'reverificationPolicyRef',freshness_ref,'reasonCodes',to_jsonb(reason_values))::text,'UTF8'),'sha256'),'hex');
    insert into world_knowledge_private.verification_records(claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,reason_codes,result_hash)
    values(v_claim_id,content_hash,p_spot_id,p_attribute_key,'SPOT','backyrd.world-knowledge.source-policy@3b.1',method,authority,binding_id,'VERIFIED',checked_at_value,freshness_ref,reason_values,verification_hash);
  end;
  if shadow_hold then insert into world_knowledge_private.review_work_items(spot_id,work_class,priority,attribute_key,candidate_payload,reason_codes) values(p_spot_id,'CONTENT_SAFETY','HIGH',p_attribute_key,jsonb_build_object('claimId',v_claim_id),array['NEW_TEXT_SHADOW_HELD']); end if;
  if exists(select 1 from world_knowledge_private.claims c join world_knowledge_private.verification_records v on v.claim_id=c.id and v.result='VERIFIED' where c.spot_id=p_spot_id and c.attribute_key=p_attribute_key and c.id<>v_claim_id and c.value is distinct from p_value and c.observed_at between p_observed_at-interval '5 minutes' and p_observed_at+interval '5 minutes') then insert into world_knowledge_private.review_work_items(spot_id,work_class,priority,attribute_key,candidate_payload,reason_codes) values(p_spot_id,'AUTHORITY_CONFLICT','HIGH',p_attribute_key,jsonb_build_object('claimId',v_claim_id),array['CONCURRENT_AUTHORITATIVE_CONFLICT']); end if;
  return jsonb_build_object('claimId',v_claim_id,'created',true,'verificationMethod',method,'visibility',case when shadow_hold then 'SHADOW_HELD' else p_visibility end);
end $$;

create or replace function public.world_owner_submit_claim_v1(p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,p_observed_at timestamptz,p_valid_from timestamptz default null,p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',p_supersedes_claim_id uuid default null,p_idempotency_key text default null)
returns jsonb language sql security definer set search_path='' as $$
  select world_knowledge_private.submit_authoritative_claim_v1('VERIFIED_OWNER',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
$$;

create or replace function public.world_admin_submit_claim_v1(p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,p_observed_at timestamptz,p_valid_from timestamptz default null,p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',p_supersedes_claim_id uuid default null,p_idempotency_key text default null)
returns jsonb language sql security definer set search_path='' as $$
  select world_knowledge_private.submit_authoritative_claim_v1('ADMIN',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
$$;

revoke execute on function world_knowledge_private.reject_immutable_mutation_v1(),world_knowledge_private.detach_actor_binding_v1(),world_knowledge_private.attribute_value_valid_v1(text,text,text,jsonb),world_knowledge_private.text_requires_shadow_v1(text,jsonb),world_knowledge_private.validate_claim_insert_v1(),world_knowledge_private.validate_verification_insert_v1(),world_knowledge_private.validate_confirmation_insert_v1(),world_knowledge_private.get_actor_binding_v1(uuid,text),world_knowledge_private.submit_authoritative_claim_v1(text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_confirm_claim_v1(uuid,text),public.world_submit_user_report_v1(uuid,text,jsonb,text),public.world_admin_record_identity_event_v1(text,uuid,uuid,text,text,text[],text),public.world_shadow_rebuild_spot_v1(uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_confirm_claim_v1(uuid,text),public.world_submit_user_report_v1(uuid,text,jsonb,text) to authenticated;
grant execute on function public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_admin_record_identity_event_v1(text,uuid,uuid,text,text,text[],text) to authenticated;
grant execute on function public.world_shadow_rebuild_spot_v1(uuid,timestamptz,text,text) to service_role;
