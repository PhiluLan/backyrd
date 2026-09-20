\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Product World bridge failed: %',p_message; end if; end $$;

select pg_temp.assert(
  has_function_privilege('service_role','public.backyrd_decision_vnext_product_context_v3(uuid,text,text,text,text,text,text,bigint)','execute')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_context_v3(uuid,text,text,text,text,text,text,bigint)','execute')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v3(uuid,text,text,text,text,text,text,bigint)','execute'),
  'Product context must remain service-only'
);
select pg_temp.assert(
  not has_function_privilege('anon','world_knowledge_private.product_decision_projection_v1(jsonb)','execute')
  and not has_function_privilege('authenticated','world_knowledge_private.product_decision_projection_v1(jsonb)','execute')
  and not has_function_privilege('service_role','world_knowledge_private.product_decision_projection_v1(jsonb)','execute'),
  'private projection must not be directly callable by clients or service_role'
);

with snapshot as (
  select jsonb_build_object(
    'spotId','11111111-1111-4111-a111-111111111111',
    'registryVersion','backyrd.world-knowledge.registry@2.1',
    'policyVersion','backyrd.world-knowledge.source-policy@4b.1',
    'facts',jsonb_build_array(
      jsonb_build_object('key','identity.name','scope','SPOT','value','Synthetic Café'),
      jsonb_build_object('key','purpose.primary_visit','scope','SPOT','value','EAT_DRINK'),
      jsonb_build_object('key','context.atmosphere','scope','SPOT','value',jsonb_build_array()),
      jsonb_build_object('key','operation.price_level','scope','SPOT','value','MEDIUM'),
      jsonb_build_object('key','contact.phone','scope','SPOT','value','synthetic-private'),
      jsonb_build_object('key','state.current','scope','SPOT','value',jsonb_build_object('kind','AREA_CLOSED','scope','VENUE'),'basisClaimHashes',jsonb_build_array(repeat('a',64)))
    ),
    'explicitUnknowns',jsonb_build_array(
      jsonb_build_object('key','offering.onsite','scope','SPOT'),
      jsonb_build_object('key','contact.email','scope','SPOT')
    ),'conflicts','[]'::jsonb
  ) as body
), projection as (
  select world_knowledge_private.product_decision_projection_v1(body) as result from snapshot
)
select pg_temp.assert(
  result->>'contractVersion'='backyrd.world-knowledge.product-decision-projection@1.0'
  and exists(select 1 from jsonb_array_elements(result->'facts') f where f->>'key'='purpose.primary_visit' and f->>'value'='EAT_DRINK')
  and exists(select 1 from jsonb_array_elements(result->'facts') f where f->>'key'='context.atmosphere')
  and exists(select 1 from jsonb_array_elements(result->'facts') f where f->>'key'='operation.price_level' and f->>'value'='MEDIUM')
  and exists(select 1 from jsonb_array_elements(result->'explicitUnknowns') u where u->>'key'='offering.onsite')
  and not result::text like '%synthetic-private%'
  and not result::text like '%contact.%'
  and exists(select 1 from jsonb_array_elements(result->'facts') f where f->>'key'='state.current' and f->>'validityVerified'='false'),
  'authorized facts, unknowns, validity and private-field filtering'
) from projection;
rollback;
