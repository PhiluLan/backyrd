-- Metadata only. Run with psql -X --set ON_ERROR_STOP=1 --file <this file>.
-- This is an upgrade inventory, not an upgrade authorization or a data scan.
-- Detection basis: https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
begin transaction isolation level repeatable read read only;
set local search_path = pg_catalog;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
with index_keys as (
  select ns.nspname as schema_name, tbl.relname as table_name,
    idx.relname as index_name, am.amname as access_method, ty.typname as key_type
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_catalog.pg_am am on am.oid = idx.relam
  join lateral unnest(i.indclass::oid[]) with ordinality k(opclass, position) on true
  join pg_catalog.pg_opclass oc on oc.oid = k.opclass
  join pg_catalog.pg_type ty on ty.oid = oc.opcintype
  where k.position <= i.indnkeyatts
), candidates as (
  select distinct schema_name, table_name, index_name, access_method,
    case when key_type in ('ltree', '_ltree') then 'ltree_review'
      else 'gist_float_nan_review' end as reason
  from index_keys
  where key_type in ('ltree', '_ltree')
    or (access_method = 'gist' and key_type in ('float4', 'float8'))
), operators as (
  select n.nspname as schema_name, o.oprname as operator_name,
    pg_catalog.format_type(o.oprleft, null) as left_type,
    pg_catalog.format_type(o.oprright, null) as right_type,
    o.oprrest::regproc::text as restrict_estimator,
    o.oprjoin::regproc::text as join_estimator
  from pg_catalog.pg_operator o
  join pg_catalog.pg_namespace n on n.oid = o.oprnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and ((o.oprrest <> 0 and o.oprrest::oid >= 10000)
      or (o.oprjoin <> 0 and o.oprjoin::oid >= 10000))
    and not exists (
      select 1 from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_operator'::regclass
        and d.objid = o.oid and d.deptype = 'e'
    )
)
select pg_catalog.jsonb_build_object(
  'contract', 'backyrd.postgres-upgrade-inventory@1',
  'server_version', pg_catalog.current_setting('server_version'),
  'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
  'read_only', pg_catalog.current_setting('transaction_read_only') = 'on',
  'database', (select pg_catalog.jsonb_build_object(
    'encoding', pg_catalog.pg_encoding_to_char(encoding),
    'collation_provider', datlocprovider,
    'ltree_casefold_review', pg_catalog.pg_encoding_max_length(encoding) > 1 or datlocprovider <> 'c'
  ) from pg_catalog.pg_database where datname = pg_catalog.current_database()),
  'extensions', (select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('name', extname, 'version', extversion) order by extname
  ), '[]'::jsonb) from pg_catalog.pg_extension),
  'index_candidates', (select coalesce(pg_catalog.jsonb_agg(to_jsonb(c)
    order by schema_name, index_name, reason), '[]'::jsonb) from candidates c),
  'custom_estimator_operators', (select coalesce(pg_catalog.jsonb_agg(to_jsonb(o)
    order by schema_name, operator_name, left_type, right_type), '[]'::jsonb) from operators o),
  'pgcrypto_data_scan', 'not_performed',
  'upgrade_certified', false
);
rollback;
