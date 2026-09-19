\set ON_ERROR_STOP on
begin;

-- backyrd:authorization-positive
-- backyrd:authorization-negative

create function pg_temp.assert_catalog(p_ok boolean,p_message text) returns void
language plpgsql as $$ begin if p_ok is not true then raise exception 'catalog context: %',p_message; end if; end $$;

select pg_temp.assert_catalog(
  has_function_privilege('service_role','public.backyrd_decision_vnext_product_context_v2(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('public','public.backyrd_decision_vnext_product_context_v2(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_context_v2(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v2(uuid,text,text,text,text,text,text,bigint)','EXECUTE'),
  'only the service role may execute the bounded context');

-- Even a service caller cannot bypass OFF or supply an unrecognized intent.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.expect_catalog_error(p_query text,p_code text) returns void language plpgsql as $$
begin
  execute p_query;
  raise exception 'expected SQLSTATE % was not raised',p_code;
exception when others then
  if sqlstate <> p_code then raise; end if;
end $$;
select pg_temp.expect_catalog_error(
  format('select public.backyrd_decision_vnext_product_context_v2(null,%L,%L,%L,%L,%L,%L,%s)',
    repeat('a',64),'Basel','UNRECOGNIZED',repeat('b',64),repeat('c',64),repeat('d',64),-1),
  '55000');

rollback;
