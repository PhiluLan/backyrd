-- Remove only the Restaurant Information V1 grant delta while reconstructing
-- an earlier canonical Public ACL fingerprint.
revoke execute on function public.backyrd_restaurant_url_is_valid_v1(text,jsonb) from service_role;
revoke execute on function public.backyrd_restaurant_value_is_valid_v1(text,jsonb) from service_role;
revoke execute on function public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb) from service_role;
revoke execute on function public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text) from authenticated,service_role;
revoke execute on function public.backyrd_restaurant_information_v1(uuid) from anon,authenticated,service_role;
revoke execute on function public.admin_restaurant_information_coverage_v1() from authenticated,service_role;
