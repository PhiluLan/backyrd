-- The incident repair changes an RPC-specific time budget, never its authority.
begin;
do $$
declare target regprocedure := 'public.backyrd_decision_vnext_product_context_v7(uuid,text,text,text,text,text,text,bigint)'::regprocedure;
  body text; settings text[];
begin
  select prosrc,proconfig into body,settings from pg_proc where oid=target;
  if not ('statement_timeout=15s'=any(settings)) then raise exception 'regional_context_budget_missing'; end if;
  if has_function_privilege('anon',target,'execute') or has_function_privilege('authenticated',target,'execute')
     or not has_function_privilege('service_role',target,'execute') then raise exception 'regional_context_acl_changed'; end if;
  if position('assert_service_authority_v1' in body)=0
     or position('backyrd_decision_vnext_product_control_v1' in body)=0
     or position('validate_resolution_manifest_v1' in body)=0
     or position('NO_CONSENT' in body)=0 then raise exception 'regional_context_boundary_missing'; end if;
  if exists(select 1 from pg_proc where oid=target and (not prosecdef or not ('search_path=""'=any(proconfig)))) then raise exception 'regional_context_security_config_changed'; end if;
end $$;
rollback;
