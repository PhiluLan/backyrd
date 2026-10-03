\set ON_ERROR_STOP on
begin;

-- backyrd:authorization-positive
-- backyrd:authorization-negative

create function pg_temp.query_cache_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'decision query cache test failed: %',p_message; end if;
end
$$;

select pg_temp.query_cache_assert(
  (select relrowsecurity from pg_class where oid='decision_vnext_private.product_query_cache_v1'::regclass),
  'query cache must have RLS enabled'
);
select pg_temp.query_cache_assert(
  not has_schema_privilege('anon','decision_vnext_private','USAGE')
  and not has_schema_privilege('authenticated','decision_vnext_private','USAGE')
  and not has_table_privilege('anon','decision_vnext_private.product_query_cache_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','decision_vnext_private.product_query_cache_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','decision_vnext_private.product_query_cache_v1','SELECT,INSERT,UPDATE,DELETE'),
  'query cache must deny direct application-role access'
);
select pg_temp.query_cache_assert(
  has_function_privilege('service_role','public.backyrd_decision_vnext_product_query_cache_v1(uuid,text,text,text,text,text,text,bigint,boolean,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_query_cache_v1(uuid,text,text,text,text,text,text,bigint,boolean,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_query_cache_v1(uuid,text,text,text,text,text,text,bigint,boolean,jsonb)','EXECUTE')
  and not has_function_privilege('public','public.backyrd_decision_vnext_product_query_cache_v1(uuid,text,text,text,text,text,text,bigint,boolean,jsonb)','EXECUTE'),
  'only the service role may call the query cache RPC'
);
select pg_temp.query_cache_assert(
  has_function_privilege('service_role','public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('public','public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)','EXECUTE'),
  'full-city context remains service-only'
);
select pg_temp.query_cache_assert(
  exists(select 1 from pg_constraint where conrelid='decision_vnext_private.product_query_cache_v1'::regclass
    and conname='product_query_cache_v1_ttl')
  and exists(select 1 from pg_constraint where conrelid='decision_vnext_private.product_query_cache_v1'::regclass
    and conname='product_query_cache_v1_identity'),
  'query cache must bind one result per request and expire within 24 hours'
);

rollback;
