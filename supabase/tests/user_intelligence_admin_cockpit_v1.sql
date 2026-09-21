\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.ui_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'user intelligence cockpit test failed: %',p_message;end if;end$$;
create function pg_temp.ui_actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end$$;

select pg_temp.ui_assert(not has_function_privilege('anon','public.backyrd_admin_user_intelligence_cockpit_list_v1(text,integer,integer)','execute'),'anon list execute grant');
select pg_temp.ui_assert(not has_function_privilege('anon','public.backyrd_admin_user_intelligence_cockpit_detail_v1(uuid,integer)','execute'),'anon detail execute grant');
select pg_temp.ui_assert(has_function_privilege('authenticated','public.backyrd_admin_user_intelligence_cockpit_list_v1(text,integer,integer)','execute'),'authenticated list gateway missing');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','78000000-0000-4000-8000-000000000001','authenticated','authenticated','cockpit-admin@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','78000000-0000-4000-8000-000000000002','authenticated','authenticated','cockpit-user@invalid','','{}','{}',now(),now());
update public.profiles set is_admin=true where id='78000000-0000-4000-8000-000000000001';
insert into public.admin_users(user_id,role) values('78000000-0000-4000-8000-000000000001','super_admin');

set local role authenticated;
select pg_temp.ui_actor('78000000-0000-4000-8000-000000000002');
do $$begin
 perform public.backyrd_admin_user_intelligence_cockpit_list_v1(null,10,0);
 raise exception 'non-admin list accepted';
exception when insufficient_privilege then perform pg_temp.ui_assert(sqlerrm='admin_required','non-admin denial reason');end$$;

select pg_temp.ui_actor('78000000-0000-4000-8000-000000000001');
do $$declare v_list jsonb;v_detail jsonb;begin
 v_list:=public.backyrd_admin_user_intelligence_cockpit_list_v1('cockpit-user@invalid',10,0);
 perform pg_temp.ui_assert(v_list->>'contractVersion'='backyrd.admin-user-intelligence-cockpit-list@1.0','list contract version');
 perform pg_temp.ui_assert(jsonb_array_length(v_list->'users')=1,'search did not return exact fixture');
 perform pg_temp.ui_assert(v_list#>>'{users,0,profile_state}'='NO_CONSENT','absence of consent is not fail closed');
 v_detail:=public.backyrd_admin_user_intelligence_cockpit_detail_v1('78000000-0000-4000-8000-000000000002',100);
 perform pg_temp.ui_assert(v_detail->>'contractVersion'='backyrd.admin-user-intelligence-cockpit-detail@1.0','detail contract version');
 perform pg_temp.ui_assert(v_detail#>>'{privacy,rawDecisionTextIncluded}'='false','raw decision text privacy flag');
 perform pg_temp.ui_assert(v_detail#>>'{privacy,serviceCredentialsIncluded}'='false','credential privacy flag');
 perform pg_temp.ui_assert(v_detail#>>'{profile,state}'='NO_CONSENT','detail consent boundary');
end$$;

reset role;
rollback;
