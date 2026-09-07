\set ON_ERROR_STOP on

-- Exact additive Restaurant Information V1 ACL and schema assertions. The
-- historical Events V1 fingerprints remain independently frozen and proven.
select
  not has_function_privilege('anon','public.backyrd_restaurant_url_is_valid_v1(text,jsonb)','execute')
  and not has_function_privilege('authenticated','public.backyrd_restaurant_url_is_valid_v1(text,jsonb)','execute')
  and has_function_privilege('service_role','public.backyrd_restaurant_url_is_valid_v1(text,jsonb)','execute')
  and not has_function_privilege('anon','public.backyrd_restaurant_value_is_valid_v1(text,jsonb)','execute')
  and not has_function_privilege('authenticated','public.backyrd_restaurant_value_is_valid_v1(text,jsonb)','execute')
  and has_function_privilege('service_role','public.backyrd_restaurant_value_is_valid_v1(text,jsonb)','execute')
  and not has_function_privilege('anon','public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb)','execute')
  and not has_function_privilege('authenticated','public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb)','execute')
  and has_function_privilege('service_role','public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb)','execute')
  and not has_function_privilege('anon','public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text)','execute')
  and has_function_privilege('authenticated','public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text)','execute')
  and has_function_privilege('service_role','public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text)','execute')
  and has_function_privilege('anon','public.backyrd_restaurant_information_v1(uuid)','execute')
  and has_function_privilege('authenticated','public.backyrd_restaurant_information_v1(uuid)','execute')
  and has_function_privilege('service_role','public.backyrd_restaurant_information_v1(uuid)','execute')
  and not has_function_privilege('anon','public.admin_restaurant_information_coverage_v1()','execute')
  and has_function_privilege('authenticated','public.admin_restaurant_information_coverage_v1()','execute')
  and has_function_privilege('service_role','public.admin_restaurant_information_coverage_v1()','execute')
  as restaurant_v1_acl_is_exact
\gset
\if :restaurant_v1_acl_is_exact
  \echo 'Restaurant V1 current ACL contract passed.'
\else
  select 1/0;
\endif

select
  (select count(*)=16 from public.backyrd_spot_fact_catalog_v1 where contract_version='backyrd-restaurant-information-v1')
  and (select count(*)=16 from public.backyrd_human_spot_questions_v2 where contract_version='backyrd-restaurant-information-v1' and owner_access='FOUNDER_ONLY')
  and not exists(select 1 from public.backyrd_spot_fact_catalog_v1 where contract_version='backyrd-restaurant-information-v1' and engine_role<>'DISPLAY_ONLY' and field_key<>'location.neighborhood')
  and (select count(*)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('backyrd_human_spot_validate_answer_v3','backyrd_human_spot_save_section_v3','backyrd_restaurant_information_v1','admin_restaurant_information_coverage_v1')
      and p.prosecdef and p.proconfig is not null)
  and exists(select 1 from pg_constraint where conrelid='public.backyrd_human_spot_questions_v2'::regclass
    and conname='backyrd_human_spot_questions_v2_control_type_check'
    and pg_get_constraintdef(oid) like '%SPECIAL_HOURS%')
  as restaurant_v1_schema_is_exact
\gset
\if :restaurant_v1_schema_is_exact
  \echo 'Restaurant V1 current schema contract passed.'
\else
  select 1/0;
\endif
