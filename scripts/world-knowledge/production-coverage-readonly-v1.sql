\set ON_ERROR_STOP on
begin transaction read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '15s';

-- Version: backyrd.world-knowledge.production-coverage-query@1.0
-- Output is one aggregate JSON value. No identifying spot, owner, user, contact,
-- provider or source-reference value is selected or returned.
with
migration_tip as (
  select max(version)::text as version from supabase_migrations.schema_migrations
),
spot_counts as (
  select count(*)::bigint total,
    count(*) filter (where status = 'approved')::bigint approved,
    count(*) filter (where status = 'archived')::bigint archived,
    count(*) filter (where status not in ('approved', 'archived'))::bigint other
  from public.spots
),
spot_coverage as (
  select
    count(*) filter (where nullif(btrim(name), '') is not null)::bigint name,
    count(*) filter (where nullif(btrim(address), '') is not null)::bigint address,
    count(*) filter (where nullif(btrim(city), '') is not null)::bigint locality,
    count(*) filter (where lat is not null and lng is not null)::bigint coordinates,
    count(*) filter (where lat is not null and lng is not null and (lat not between -90 and 90 or lng not between -180 and 180))::bigint implausible_coordinates,
    count(*) filter (where category_id is not null)::bigint category,
    count(*) filter (where price_level is not null)::bigint ordinal_price,
    count(*) filter (where nullif(btrim(website), '') is not null)::bigint website,
    count(*) filter (where nullif(btrim(phone), '') is not null)::bigint phone,
    count(*) filter (where nullif(btrim(email), '') is not null)::bigint ambiguous_email,
    count(*) filter (where nullif(btrim(google_place_id), '') is not null)::bigint external_google_reference
  from public.spots
),
hours as (
  select count(distinct spot_id)::bigint spots_with_regular_hours,
    count(*) filter (where open_time is null or close_time is null or open_time = close_time)::bigint structurally_invalid_rows
  from public.spot_hours
),
gold as (
  select count(distinct f.spot_id)::bigint spots_with_accepted_facts,
    count(*)::bigint accepted_fact_rows,
    count(*) filter (where f.source_id is null)::bigint accepted_facts_without_source_fk,
    count(*) filter (where f.observed_at is null)::bigint accepted_facts_without_observed_at,
    count(*) filter (where f.valid_until is null)::bigint accepted_facts_without_valid_until,
    count(*) filter (where f.status = 'STALE')::bigint stale_rows
  from public.backyrd_spot_accepted_facts_v1 f
),
source_coverage as (
  select count(*)::bigint source_rows,
    count(*) filter (where source_url is null and source_reference is null)::bigint unbound_source_rows,
    count(*) filter (where last_checked_at is null)::bigint sources_without_last_check
  from public.backyrd_spot_sources_v1
),
duplicate_candidates as (
  select
    coalesce(sum(group_count - 1), 0)::bigint duplicate_rows_by_google_reference,
    count(*)::bigint duplicate_google_reference_groups
  from (
    select count(*)::bigint group_count
    from public.spots
    where nullif(btrim(google_place_id), '') is not null
    group by google_place_id
    having count(*) > 1
  ) groups
),
category_counts as (
  select count(distinct s.category_id)::bigint used_legacy_categories,
    count(*) filter (where s.category_id is null)::bigint spots_without_category
  from public.spots s
),
security_aggregate as (
  select
    count(*) filter (where c.relkind = 'r' and n.nspname = 'public')::bigint public_tables,
    count(*) filter (where c.relkind = 'r' and n.nspname = 'public' and c.relrowsecurity)::bigint public_tables_with_rls,
    count(*) filter (where c.relkind = 'v' and n.nspname = 'public')::bigint public_views
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
),
security_definer_aggregate as (
  select count(*) filter (where p.prosecdef)::bigint security_definer_functions,
    count(*) filter (where p.prosecdef and exists (
      select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ))::bigint security_definer_public_execute
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select jsonb_build_object(
  'queryVersion', 'backyrd.world-knowledge.production-coverage-query@1.0',
  'migrationTip', migration_tip.version,
  'spots', to_jsonb(spot_counts),
  'coverage', to_jsonb(spot_coverage),
  'hours', to_jsonb(hours),
  'gold', to_jsonb(gold),
  'sources', to_jsonb(source_coverage),
  'duplicates', to_jsonb(duplicate_candidates),
  'categories', to_jsonb(category_counts),
  'security', to_jsonb(security_aggregate) || to_jsonb(security_definer_aggregate)
)
from migration_tip, spot_counts, spot_coverage, hours, gold, source_coverage,
  duplicate_candidates, category_counts, security_aggregate, security_definer_aggregate;

rollback;
