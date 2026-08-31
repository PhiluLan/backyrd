-- Complete Backyrd-owned catalog inventory. This query is read-only and is the
-- canonical way to regenerate the Database Consolidation inventory snapshot.
with application_schemas(schema_name) as (
  values ('public'),('decision_lab'),('audit'),('drizzle')
), relation_rows as (
  select
    case c.relkind
      when 'r' then 'TABLE' when 'p' then 'PARTITIONED_TABLE'
      when 'v' then 'VIEW' when 'm' then 'MATERIALIZED_VIEW'
      when 'i' then 'INDEX' when 'S' then 'SEQUENCE' when 'f' then 'FOREIGN_TABLE'
    end object_type,
    n.nspname::text schema_name,
    c.relname::text object_name,
    format('%I.%I',n.nspname,c.relname) identity,
    c.relrowsecurity rls_enabled,
    false security_definer,
    greatest(c.reltuples::bigint,0) estimated_rows,
    (
      select count(*) from pg_depend d
       where d.refclassid='pg_class'::regclass and d.refobjid=c.oid and d.deptype in ('n','a')
    )::bigint dependency_count,
    concat_ws(',',
      case when has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') then 'anon' end,
      case when has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') then 'authenticated' end,
      case when has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') then 'service_role' end
    ) client_roles
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join application_schemas s on s.schema_name=n.nspname
  where c.relkind in ('r','p','v','m','i','S','f')
    and not exists (
      select 1 from pg_depend d
       where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
    )
), function_rows as (
  select
    case when p.prokind='p' then 'PROCEDURE' else 'FUNCTION' end object_type,
    n.nspname::text schema_name,
    p.proname::text object_name,
    p.oid::regprocedure::text identity,
    false rls_enabled,
    p.prosecdef security_definer,
    0::bigint estimated_rows,
    (
      (select count(*) from pg_trigger t where t.tgfoid=p.oid and not t.tgisinternal)
      + (select count(*) from pg_proc caller join pg_namespace cn on cn.oid=caller.pronamespace
          where cn.nspname in (select schema_name from application_schemas)
            and caller.oid<>p.oid and caller.prosrc ilike '%'||p.proname||'%')
      + (select count(*) from cron.job j where j.command ilike '%'||p.proname||'%')
    )::bigint dependency_count,
    concat_ws(',',
      case when has_function_privilege('anon',p.oid,'EXECUTE') then 'anon' end,
      case when has_function_privilege('authenticated',p.oid,'EXECUTE') then 'authenticated' end,
      case when has_function_privilege('service_role',p.oid,'EXECUTE') then 'service_role' end
    ) client_roles
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join application_schemas s on s.schema_name=n.nspname
  where p.prokind in ('f','p')
    and not exists (
      select 1 from pg_depend d
       where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    )
), trigger_rows as (
  select 'TRIGGER' object_type,n.nspname::text schema_name,t.tgname::text object_name,
         format('%I.%I:%I',n.nspname,c.relname,t.tgname) identity,
         false rls_enabled,false security_definer,0::bigint estimated_rows,1::bigint dependency_count,''::text client_roles
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  join application_schemas s on s.schema_name=n.nspname where not t.tgisinternal
), policy_rows as (
  select 'POLICY' object_type,n.nspname::text schema_name,pol.polname::text object_name,
         format('%I.%I:%I',n.nspname,c.relname,pol.polname) identity,
         false rls_enabled,false security_definer,0::bigint estimated_rows,1::bigint dependency_count,''::text client_roles
  from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
  join application_schemas s on s.schema_name=n.nspname
), schema_rows as (
  select 'SCHEMA' object_type,n.nspname::text schema_name,n.nspname::text object_name,
         quote_ident(n.nspname) identity,false rls_enabled,false security_definer,0::bigint estimated_rows,
         (select count(*) from pg_class c where c.relnamespace=n.oid)::bigint dependency_count,''::text client_roles
  from pg_namespace n join application_schemas s on s.schema_name=n.nspname
), extension_rows as (
  select 'EXTENSION' object_type,''::text schema_name,e.extname::text object_name,e.extname::text identity,
         false rls_enabled,false security_definer,0::bigint estimated_rows,0::bigint dependency_count,''::text client_roles
  from pg_extension e
  where e.extname in ('citext','pg_cron','pg_graphql','pg_net','pg_stat_statements','pg_trgm','pgcrypto','postgis','supabase_vault','unaccent','uuid-ossp','vector')
), grant_rows as (
  select 'GRANT' object_type,g.table_schema::text schema_name,g.table_name::text object_name,
         format('TABLE|%I.%I|%I|%s',g.table_schema,g.table_name,g.grantee,g.privilege_type) identity,
         false rls_enabled,false security_definer,0::bigint estimated_rows,1::bigint dependency_count,g.grantee::text client_roles
  from information_schema.role_table_grants g
  where g.table_schema in (select schema_name from application_schemas)
  union all
  select 'GRANT',g.routine_schema::text,g.routine_name::text,
         format('ROUTINE|%I.%I|%I|%s',g.routine_schema,g.specific_name,g.grantee,g.privilege_type),
         false,false,0::bigint,1::bigint,g.grantee::text
  from information_schema.role_routine_grants g
  where g.routine_schema in (select schema_name from application_schemas)
), objects as (
  select * from schema_rows union all select * from relation_rows union all select * from function_rows
  union all select * from trigger_rows union all select * from policy_rows union all select * from extension_rows
  union all select * from grant_rows
)
select object_type,schema_name,object_name,identity,rls_enabled,security_definer,
       estimated_rows,dependency_count,client_roles
from objects
order by schema_name,object_type,identity;
