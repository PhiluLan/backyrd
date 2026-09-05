\set ON_ERROR_STOP on

-- Gate 7 adds only a service-role operational counter and three service-role
-- RPCs. Browser roles must have no direct or indirect access.
select
  not has_table_privilege('anon','public.backyrd_launch_cost_counters_v1','select')
  and not has_table_privilege('anon','public.backyrd_launch_cost_counters_v1','insert')
  and not has_table_privilege('anon','public.backyrd_launch_cost_counters_v1','update')
  and not has_table_privilege('anon','public.backyrd_launch_cost_counters_v1','delete')
  and not has_table_privilege('authenticated','public.backyrd_launch_cost_counters_v1','select')
  and not has_table_privilege('authenticated','public.backyrd_launch_cost_counters_v1','insert')
  and not has_table_privilege('authenticated','public.backyrd_launch_cost_counters_v1','update')
  and not has_table_privilege('authenticated','public.backyrd_launch_cost_counters_v1','delete')
  and has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','select')
  and has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','insert')
  and has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','update')
  and has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','delete')
  and not has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','truncate')
  and not has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','references')
  and not has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','trigger')
  and not has_function_privilege('anon','public.backyrd_consume_launch_cost_boundary_v1(text,text,integer,integer,integer,integer)','execute')
  and not has_function_privilege('authenticated','public.backyrd_consume_launch_cost_boundary_v1(text,text,integer,integer,integer,integer)','execute')
  and has_function_privilege('service_role','public.backyrd_consume_launch_cost_boundary_v1(text,text,integer,integer,integer,integer)','execute')
  and not has_function_privilege('anon','public.backyrd_has_claimable_embedding_job_v1()','execute')
  and not has_function_privilege('authenticated','public.backyrd_has_claimable_embedding_job_v1()','execute')
  and has_function_privilege('service_role','public.backyrd_has_claimable_embedding_job_v1()','execute')
  and not has_function_privilege('anon','public.backyrd_launch_operations_snapshot_v1()','execute')
  and not has_function_privilege('authenticated','public.backyrd_launch_operations_snapshot_v1()','execute')
  and has_function_privilege('service_role','public.backyrd_launch_operations_snapshot_v1()','execute')
  as gate7_acl_is_exact
\gset
\if :gate7_acl_is_exact
  \echo 'Gate 7 service-only operational ACL facts passed.'
\else
  select 1/0;
\endif

-- Revoke exactly the Gate 7 delta and prove the Gate 6 canonical ACL returns.
begin;
revoke select, insert, update, delete on table public.backyrd_launch_cost_counters_v1 from service_role;
revoke execute on function public.backyrd_consume_launch_cost_boundary_v1(text,text,integer,integer,integer,integer) from service_role;
revoke execute on function public.backyrd_has_claimable_embedding_job_v1() from service_role;
revoke execute on function public.backyrd_launch_operations_snapshot_v1() from service_role;

with roles(role_name) as (
  values ('anon'),('authenticated'),('service_role')
), table_privileges(privilege_name) as (
  values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
), sequence_privileges(privilege_name) as (
  values ('USAGE'),('SELECT'),('UPDATE')
), entries(entry) as (
  select 'FUNCTION|'||p.oid::regprocedure::text||'|'||r.role_name||'|EXECUTE'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join roles r
  where n.nspname='public' and has_function_privilege(r.role_name,p.oid,'EXECUTE')
  union all
  select 'TABLE|'||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||'|'||r.role_name||'|'||v.privilege_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join roles r cross join table_privileges v
  where n.nspname='public' and c.relkind in ('r','p','v','m','f') and has_table_privilege(r.role_name,c.oid,v.privilege_name)
  union all
  select 'SEQUENCE|'||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||'|'||r.role_name||'|'||v.privilege_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join roles r cross join sequence_privileges v
  where n.nspname='public' and c.relkind='S' and has_sequence_privilege(r.role_name,c.oid,v.privilege_name)
)
select encode(extensions.digest(convert_to(string_agg(entry,E'\n' order by entry)||E'\n','UTF8'),'sha256'),'hex')
  = '3b7cad7d4b11586db024d182ee27126062be76b5697650dd28e4f03f382f7883'
  as gate7_prior_acl_reconstructed
from entries
\gset
\if :gate7_prior_acl_reconstructed
  \echo 'Gate 7 prior Public ACL fingerprint reconstructed exactly.'
\else
  select 1/0;
\endif
rollback;

select
  has_table_privilege('service_role','public.backyrd_launch_cost_counters_v1','select')
  and has_function_privilege('service_role','public.backyrd_launch_operations_snapshot_v1()','execute')
  and not has_function_privilege('authenticated','public.backyrd_launch_operations_snapshot_v1()','execute')
  as gate7_acl_rollback_preserved
\gset
\if :gate7_acl_rollback_preserved
  \echo 'Gate 7 operational ACL survived proof rollback.'
\else
  select 1/0;
\endif
