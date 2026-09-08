-- Reconstruct only the schema objects changed by Restaurant Information V1.
delete from public.backyrd_human_spot_questions_v2
where contract_version='backyrd-restaurant-information-v1';
delete from public.backyrd_spot_fact_catalog_v1
where contract_version='backyrd-restaurant-information-v1';

alter table public.backyrd_human_spot_questions_v2
  drop constraint backyrd_human_spot_questions_v2_control_type_check;
alter table public.backyrd_human_spot_questions_v2
  add constraint backyrd_human_spot_questions_v2_control_type_check
  check(control_type in ('SINGLE_CHOICE','MULTI_CHOICE','TRI_STATE_MAP','AVAILABILITY_MAP','PURPOSE_MAP','AGE_RANGE','DURATION_RANGE','ACCESSIBILITY_MAP'));

drop function public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text);
drop function public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb);
drop function public.admin_restaurant_information_coverage_v1();
drop function public.backyrd_restaurant_information_v1(uuid);
drop function public.backyrd_restaurant_value_is_valid_v1(text,jsonb);
drop function public.backyrd_restaurant_url_is_valid_v1(text,jsonb);
