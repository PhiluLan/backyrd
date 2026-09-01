\set ON_ERROR_STOP on

-- Gate 5 re-certification contract for the only intended public ACL delta.
-- The current state must expose assignments to their authenticated owner only.
select
  not has_table_privilege('anon', 'public.user_achievements', 'select')
  and not has_table_privilege('anon', 'public.user_achievements', 'insert')
  and not has_table_privilege('anon', 'public.user_achievements', 'update')
  and not has_table_privilege('anon', 'public.user_achievements', 'delete')
  and has_table_privilege('authenticated', 'public.user_achievements', 'select')
  and not has_table_privilege('authenticated', 'public.user_achievements', 'insert')
  and not has_table_privilege('authenticated', 'public.user_achievements', 'update')
  and not has_table_privilege('authenticated', 'public.user_achievements', 'delete')
  and has_table_privilege('service_role', 'public.user_achievements', 'select')
  and has_table_privilege('service_role', 'public.user_achievements', 'insert')
  and has_table_privilege('service_role', 'public.user_achievements', 'update')
  and has_table_privilege('service_role', 'public.user_achievements', 'delete')
  as gate5_current_acl_is_exact
\gset
\if :gate5_current_acl_is_exact
  \echo 'Gate 5 hardened achievement ACL facts passed.'
\else
  \quit 1
\endif

-- Reconstruct the prior client grants in a transaction. If this yields the
-- prior canonical global fingerprint, every other public ACL fact is unchanged.
begin;
grant select, insert, update, delete on table public.user_achievements to anon;
grant insert, update, delete on table public.user_achievements to authenticated;

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
  = '208ad3a5397792d7c4acff134e189f6b56834f0890f9e6c8180f14fb70ae564f'
  as gate5_prior_acl_reconstructed
from entries
\gset
\if :gate5_prior_acl_reconstructed
  \echo 'Gate 5 prior canonical ACL fingerprint reconstructed exactly.'
\else
  \quit 1
\endif
rollback;

-- The transaction must leave the hardened grants intact.
select
  not has_table_privilege('anon', 'public.user_achievements', 'select')
  and has_table_privilege('authenticated', 'public.user_achievements', 'select')
  and not has_table_privilege('authenticated', 'public.user_achievements', 'insert')
  as gate5_acl_rollback_preserved
\gset
\if :gate5_acl_rollback_preserved
  \echo 'Gate 5 hardened achievement ACL survived proof rollback.'
\else
  \quit 1
\endif
