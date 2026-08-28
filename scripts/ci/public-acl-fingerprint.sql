with roles(role_name) as (
  values ('anon'),('authenticated'),('service_role')
), table_privileges(privilege_name) as (
  values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
), sequence_privileges(privilege_name) as (
  values ('USAGE'),('SELECT'),('UPDATE')
), entries(entry) as (
  select 'FUNCTION|'||p.oid::regprocedure::text||'|'||r.role_name||'|EXECUTE'
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  cross join roles r
  where n.nspname='public' and has_function_privilege(r.role_name,p.oid,'EXECUTE')
  union all
  select 'TABLE|'||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||'|'||r.role_name||'|'||v.privilege_name
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join roles r
  cross join table_privileges v
  where n.nspname='public' and c.relkind in ('r','p','v','m','f')
    and has_table_privilege(r.role_name,c.oid,v.privilege_name)
  union all
  select 'SEQUENCE|'||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||'|'||r.role_name||'|'||v.privilege_name
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join roles r
  cross join sequence_privileges v
  where n.nspname='public' and c.relkind='S'
    and has_sequence_privilege(r.role_name,c.oid,v.privilege_name)
)
select encode(extensions.digest(convert_to(string_agg(entry,E'\n' order by entry)||E'\n','UTF8'),'sha256'),'hex')
from entries;
