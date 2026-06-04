-- Supabase Bestandsaufnahme + Archiv Snapshot
-- Ausfuehren im Supabase SQL Editor (in einzelnen Sections).
-- Hinweis: Fuer einen vollstaendigen Offsite-Backup (inkl. globaler Rollen/infra)
-- ist pg_dump/Supabase Backup weiterhin zusaetzlich empfohlen.

-- =========================================================
-- SECTION 0: App-Schemas (ohne System-Schemas)
-- =========================================================
create schema if not exists audit;

drop table if exists audit.app_schemas;
create table audit.app_schemas as
select nspname as schema_name
from pg_namespace
where nspname not in (
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'extensions',
  'graphql',
  'graphql_public',
  'pgtle',
  'realtime',
  'supabase_functions',
  'supabase_migrations',
  'vault'
)
and nspname not like 'pg_%'
order by 1;

select * from audit.app_schemas order by schema_name;

-- =========================================================
-- SECTION 1: Tabellen-Inventar (Excel Tab: tables)
-- =========================================================
drop table if exists audit.inventory_tables;
create table audit.inventory_tables as
with base as (
  select
    t.table_schema,
    t.table_name,
    c.oid as table_oid
  from information_schema.tables t
  join pg_class c on c.relname = t.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.table_schema
  where t.table_type = 'BASE TABLE'
    and t.table_schema in (select schema_name from audit.app_schemas)
)
select
  b.table_schema,
  b.table_name,
  coalesce(s.n_live_tup, c.reltuples)::bigint as estimated_rows,
  pg_size_pretty(pg_total_relation_size(b.table_oid)) as total_size_pretty,
  pg_total_relation_size(b.table_oid) as total_size_bytes
from base b
join pg_class c on c.oid = b.table_oid
left join pg_stat_user_tables s on s.relid = b.table_oid
order by b.table_schema, b.table_name;

select * from audit.inventory_tables order by table_schema, table_name;

-- =========================================================
-- SECTION 2: Spalten-Inventar (Excel Tab: columns)
-- =========================================================
drop table if exists audit.inventory_columns;
create table audit.inventory_columns as
select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation
from information_schema.columns c
where c.table_schema in (select schema_name from audit.app_schemas)
order by c.table_schema, c.table_name, c.ordinal_position;

select * from audit.inventory_columns order by table_schema, table_name, ordinal_position;

-- =========================================================
-- SECTION 3: Keys/Constraints (Excel Tab: constraints)
-- =========================================================
drop table if exists audit.inventory_constraints;
create table audit.inventory_constraints as
select
  n.nspname as table_schema,
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'f' then 'FOREIGN KEY'
    when 'u' then 'UNIQUE'
    when 'c' then 'CHECK'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in (select schema_name from audit.app_schemas)
order by n.nspname, c.relname, con.conname;

select * from audit.inventory_constraints order by table_schema, table_name, constraint_name;

-- =========================================================
-- SECTION 4: Indizes (Excel Tab: indexes)
-- =========================================================
drop table if exists audit.inventory_indexes;
create table audit.inventory_indexes as
select
  schemaname as table_schema,
  tablename as table_name,
  indexname,
  indexdef
from pg_indexes
where schemaname in (select schema_name from audit.app_schemas)
order by schemaname, tablename, indexname;

select * from audit.inventory_indexes order by table_schema, table_name, indexname;

-- =========================================================
-- SECTION 5: RLS + Policies (Excel Tab: rls_policies)
-- =========================================================
drop table if exists audit.inventory_policies;
create table audit.inventory_policies as
select
  p.schemaname as table_schema,
  p.tablename as table_name,
  p.policyname as policy_name,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual as using_expression,
  p.with_check as with_check_expression
from pg_policies p
where p.schemaname in (select schema_name from audit.app_schemas)
order by p.schemaname, p.tablename, p.policyname;

select * from audit.inventory_policies order by table_schema, table_name, policy_name;

drop table if exists audit.inventory_rls_status;
create table audit.inventory_rls_status as
select
  n.nspname as table_schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in (select schema_name from audit.app_schemas)
order by n.nspname, c.relname;

select * from audit.inventory_rls_status order by table_schema, table_name;

-- =========================================================
-- SECTION 6: Views + Functions + Trigger (Excel Tabs)
-- =========================================================
drop table if exists audit.inventory_views;
create table audit.inventory_views as
select
  v.schemaname as view_schema,
  v.viewname as view_name,
  v.definition as view_definition
from pg_views v
where v.schemaname in (select schema_name from audit.app_schemas)
order by v.schemaname, v.viewname;

select * from audit.inventory_views order by view_schema, view_name;

drop table if exists audit.inventory_functions;
create table audit.inventory_functions as
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in (select schema_name from audit.app_schemas)
order by n.nspname, p.proname;

select function_schema, function_name, arguments, returns, security_definer
from audit.inventory_functions
order by function_schema, function_name;

drop table if exists audit.inventory_triggers;
create table audit.inventory_triggers as
select
  event_object_schema as table_schema,
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema in (select schema_name from audit.app_schemas)
order by event_object_schema, event_object_table, trigger_name;

select * from audit.inventory_triggers order by table_schema, table_name, trigger_name;

-- =========================================================
-- SECTION 7: Rollenrechte/Grants (Excel Tab: grants)
-- =========================================================
drop table if exists audit.inventory_grants;
create table audit.inventory_grants as
select
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema in (select schema_name from audit.app_schemas)
order by table_schema, table_name, grantee, privilege_type;

select * from audit.inventory_grants order by table_schema, table_name, grantee, privilege_type;

-- =========================================================
-- SECTION 8: Enums + Extensions (Excel Tabs)
-- =========================================================
drop table if exists audit.inventory_enums;
create table audit.inventory_enums as
select
  n.nspname as enum_schema,
  t.typname as enum_name,
  e.enumsortorder,
  e.enumlabel as enum_value
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname in (select schema_name from audit.app_schemas)
order by n.nspname, t.typname, e.enumsortorder;

select * from audit.inventory_enums order by enum_schema, enum_name, enumsortorder;

drop table if exists audit.inventory_extensions;
create table audit.inventory_extensions as
select
  extname as extension_name,
  extversion as extension_version,
  n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by extname;

select * from audit.inventory_extensions order by extension_name;

-- =========================================================
-- SECTION 9: Storage Inventar (Excel Tabs: storage_buckets, storage_usage)
-- =========================================================
drop table if exists audit.inventory_storage_buckets;
create table audit.inventory_storage_buckets as
select
  id as bucket_id,
  name as bucket_name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
from storage.buckets
order by name;

select * from audit.inventory_storage_buckets order by bucket_name;

drop table if exists audit.inventory_storage_usage;
create table audit.inventory_storage_usage as
select
  o.bucket_id,
  count(*) as object_count,
  sum(
    case
      when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint
      else 0
    end
  ) as total_bytes,
  pg_size_pretty(
    sum(
      case
        when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint
        else 0
      end
    )
  ) as total_size_pretty,
  min(o.created_at) as oldest_object_at,
  max(o.created_at) as newest_object_at
from storage.objects o
group by o.bucket_id
order by o.bucket_id;

select * from audit.inventory_storage_usage order by bucket_id;

-- =========================================================
-- SECTION 10: Code-vs-DB Check (welche im Code genutzten Tabellen existieren?)
-- =========================================================
drop table if exists audit.inventory_code_tables;
create table audit.inventory_code_tables (
  table_name text primary key
);

insert into audit.inventory_code_tables(table_name) values
('achievements'),
('admin_concepts_overview_v1'),
('admin_user_overview_v1'),
('categories'),
('chat_participants'),
('chats'),
('favorites'),
('follows'),
('messages'),
('mood_cluster_jobs'),
('mood_clusters'),
('mood_concepts'),
('mood_matching'),
('mood_tokens'),
('profiles'),
('reservations'),
('review_comments'),
('review_likes'),
('review_photos'),
('review_stats'),
('reviews'),
('spot_claims'),
('spot_descriptions'),
('spot_enrichment_jobs'),
('spot_hours'),
('spot_likes'),
('spot_mood_concepts'),
('spot_moods'),
('spot_moods_agg'),
('spot_photos'),
('spot_visits'),
('spots'),
('user_achievements'),
('user_dislikes'),
('user_events'),
('user_preferences_model'),
('user_searches');

drop table if exists audit.inventory_code_vs_db;
create table audit.inventory_code_vs_db as
with db_objects as (
  select table_schema, table_name, 'table'::text as object_type
  from information_schema.tables
  where table_schema in (select schema_name from audit.app_schemas)
  union all
  select table_schema, table_name, 'view'::text as object_type
  from information_schema.views
  where table_schema in (select schema_name from audit.app_schemas)
)
select
  c.table_name as code_object_name,
  d.table_schema,
  d.object_type,
  case when d.table_name is null then false else true end as exists_in_db
from audit.inventory_code_tables c
left join db_objects d on d.table_name = c.table_name
order by c.table_name;

select * from audit.inventory_code_vs_db order by code_object_name;

-- =========================================================
-- SECTION 11: DB-internes Archiv (Snapshot aller App-Tabellen)
-- =========================================================
-- Achtung: Kann gross werden.
-- Erzeugt Schema archive_YYYYMMDD_HH24MI und kopiert alle BASE TABLES hinein.
do $$
declare
  snapshot_schema text := 'archive_' || to_char(now(), 'YYYYMMDD_HH24MI');
  r record;
begin
  execute format('create schema if not exists %I', snapshot_schema);

  for r in
    select table_schema, table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema in (select schema_name from audit.app_schemas)
    order by table_schema, table_name
  loop
    execute format(
      'create table %I.%I as table %I.%I',
      snapshot_schema,
      r.table_schema || '__' || r.table_name,
      r.table_schema,
      r.table_name
    );
  end loop;
end $$;

-- Ergebnis pruefen:
select table_schema, table_name
from information_schema.tables
where table_schema like 'archive_%'
order by table_schema, table_name;

-- =========================================================
-- SECTION 12: Export-Liste (welche Audit-Tabellen nach Excel exportieren?)
-- =========================================================
select table_name
from information_schema.tables
where table_schema = 'audit'
order by table_name;
