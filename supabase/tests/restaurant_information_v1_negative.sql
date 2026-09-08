\set ON_ERROR_STOP on
begin;

set local role authenticated;
do $$
begin
  begin
    perform public.admin_restaurant_information_coverage_v1();
    raise exception 'Restaurant Information V1 negative acceptance failed: ordinary authenticated user accessed Admin coverage';
  exception
    when sqlstate '42501' then null;
  end;

  if has_function_privilege('authenticated','public.backyrd_restaurant_url_is_valid_v1(text,jsonb)','execute')
    or has_function_privilege('authenticated','public.backyrd_restaurant_value_is_valid_v1(text,jsonb)','execute')
    or has_function_privilege('authenticated','public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb)','execute') then
    raise exception 'Restaurant Information V1 negative acceptance failed: internal validator privilege leaked';
  end if;
end $$;

set local role anon;
do $$
begin
  if has_function_privilege('anon','public.admin_restaurant_information_coverage_v1()','execute')
    or has_function_privilege('anon','public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text)','execute') then
    raise exception 'Restaurant Information V1 negative acceptance failed: anonymous Admin/write privilege leaked';
  end if;
end $$;

rollback;
