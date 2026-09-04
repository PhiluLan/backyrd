\set ON_ERROR_STOP on

select
  not has_function_privilege('anon','public.create_social_comment_v2(uuid,text,uuid)','execute')
  and has_function_privilege('authenticated','public.create_social_comment_v2(uuid,text,uuid)','execute')
  and has_function_privilege('service_role','public.create_social_comment_v2(uuid,text,uuid)','execute')
  and not has_function_privilege('anon','public.create_social_post_v2(uuid,text,text,text[],text[],jsonb,uuid)','execute')
  and has_function_privilege('authenticated','public.create_social_post_v2(uuid,text,text,text[],text[],jsonb,uuid)','execute')
  and has_function_privilege('service_role','public.create_social_post_v2(uuid,text,text,text[],text[],jsonb,uuid)','execute')
  and not has_function_privilege('anon','public.send_message_v2(uuid,text,text,uuid)','execute')
  and has_function_privilege('authenticated','public.send_message_v2(uuid,text,text,uuid)','execute')
  and has_function_privilege('service_role','public.send_message_v2(uuid,text,text,uuid)','execute')
  and not has_function_privilege('anon','public.spot_accepts_consumer_interactions_v1(uuid)','execute')
  and has_function_privilege('authenticated','public.spot_accepts_consumer_interactions_v1(uuid)','execute')
  and has_function_privilege('service_role','public.spot_accepts_consumer_interactions_v1(uuid)','execute')
  and not has_function_privilege('anon','public.admin_account_owned_storage_paths_v1(uuid)','execute')
  and has_function_privilege('authenticated','public.admin_account_owned_storage_paths_v1(uuid)','execute')
  and has_function_privilege('service_role','public.admin_account_owned_storage_paths_v1(uuid)','execute')
  and not has_function_privilege('authenticated','public.sync_social_comment_count_gate6_v1()','execute')
  and not has_function_privilege('service_role','public.sync_social_comment_count_gate6_v1()','execute')
  and not has_function_privilege('authenticated','public.sync_social_reaction_counts_gate6_v1()','execute')
  and not has_function_privilege('service_role','public.sync_social_reaction_counts_gate6_v1()','execute')
  as gate6_acl_is_exact
\gset
\if :gate6_acl_is_exact
  \echo 'Gate 6 bounded RPC ACL facts passed.'
\else
  select 1/0;
\endif

begin;
revoke execute on function public.create_social_comment_v2(uuid,text,uuid) from authenticated,service_role;
revoke execute on function public.create_social_post_v2(uuid,text,text,text[],text[],jsonb,uuid) from authenticated,service_role;
revoke execute on function public.send_message_v2(uuid,text,text,uuid) from authenticated,service_role;
revoke execute on function public.spot_accepts_consumer_interactions_v1(uuid) from authenticated,service_role;
revoke execute on function public.admin_account_owned_storage_paths_v1(uuid) from authenticated,service_role;

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
  = 'e95ebaf12aaa6e8679e7fee3681c2f1b2e4eeeeb5936252470de84b8f678b682'
  as gate6_prior_acl_reconstructed
from entries
\gset
\if :gate6_prior_acl_reconstructed
  \echo 'Gate 6 prior Public ACL fingerprint reconstructed exactly.'
\else
  select 1/0;
\endif
rollback;
