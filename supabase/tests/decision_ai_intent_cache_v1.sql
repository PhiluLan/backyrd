\set ON_ERROR_STOP on
begin;

-- backyrd:authorization-positive
-- backyrd:authorization-negative

create function pg_temp.ai_intent_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'decision ai intent cache test failed: %',p_message; end if;
end
$$;

select pg_temp.ai_intent_assert(
  (select relrowsecurity from pg_class where oid='decision_vnext_private.product_intent_cache_v1'::regclass),
  'cache must have RLS enabled'
);
select pg_temp.ai_intent_assert(
  not has_schema_privilege('anon','decision_vnext_private','USAGE')
  and not has_schema_privilege('authenticated','decision_vnext_private','USAGE')
  and not has_table_privilege('anon','decision_vnext_private.product_intent_cache_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','decision_vnext_private.product_intent_cache_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','decision_vnext_private.product_intent_cache_v1','SELECT,INSERT,UPDATE,DELETE'),
  'private cache must deny direct reads and writes to application roles'
);
select pg_temp.ai_intent_assert(
  has_function_privilege('service_role','public.backyrd_decision_vnext_product_intent_cache_v1(uuid,text,text,text,text,text,bigint,boolean,text)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_intent_cache_v1(uuid,text,text,text,text,text,bigint,boolean,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_intent_cache_v1(uuid,text,text,text,text,text,bigint,boolean,text)','EXECUTE')
  and not has_function_privilege('public','public.backyrd_decision_vnext_product_intent_cache_v1(uuid,text,text,text,text,text,bigint,boolean,text)','EXECUTE'),
  'only service role may call the intent cache RPC'
);
select pg_temp.ai_intent_assert(
  exists(select 1 from pg_constraint where conrelid='decision_vnext_private.product_intent_cache_v1'::regclass
    and conname='product_intent_cache_v1_ttl')
  and exists(select 1 from pg_constraint where conrelid='decision_vnext_private.product_intent_cache_v1'::regclass
    and conname='product_intent_cache_v1_identity'),
  'cache must bind one result per request and expire within 24 hours'
);

rollback;
