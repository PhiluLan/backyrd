\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.growth_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'growth intelligence cockpit test failed: %',p_message;end if;end$$;
create function pg_temp.growth_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end$$;

select pg_temp.growth_assert(
  not has_function_privilege('anon','public.admin_growth_intelligence_v2(timestamptz,timestamptz)','execute'),
  'anon execute grant'
);
select pg_temp.growth_assert(
  has_function_privilege('authenticated','public.admin_growth_intelligence_v2(timestamptz,timestamptz)','execute'),
  'authenticated admin gateway missing'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','7a000000-0000-4000-8000-000000000001','authenticated','authenticated','growth-admin@invalid','','{}','{}',now()-interval '10 days',now()),
 ('00000000-0000-0000-0000-000000000000','7a000000-0000-4000-8000-000000000002','authenticated','authenticated','growth-user@invalid','','{}','{}',now()-interval '3 days',now());
update public.profiles set is_admin=true where id='7a000000-0000-4000-8000-000000000001';
insert into public.admin_users(user_id,role) values('7a000000-0000-4000-8000-000000000001','super_admin');

set local role authenticated;
select pg_temp.growth_actor('7a000000-0000-4000-8000-000000000002');
do $$begin
  perform public.admin_growth_intelligence_v2(now()-interval '30 days',now());
  raise exception 'non-admin growth cockpit accepted';
exception when insufficient_privilege then
  perform pg_temp.growth_assert(sqlerrm='admin_required','non-admin denial reason');
end$$;

select pg_temp.growth_actor('7a000000-0000-4000-8000-000000000001');
do $$declare v_growth jsonb;begin
  v_growth:=public.admin_growth_intelligence_v2(now()-interval '30 days',now());
  perform pg_temp.growth_assert(v_growth->>'contractVersion'='backyrd.admin-growth-intelligence@2.0','contract version');
  perform pg_temp.growth_assert(v_growth#>>'{product,engine}'='DECISION_VNEXT_PRODUCT_V1','Product engine binding');
  perform pg_temp.growth_assert(v_growth#>>'{privacy,aggregateOnly}'='true','aggregate privacy boundary');
  perform pg_temp.growth_assert(v_growth#>>'{privacy,rawDecisionTextIncluded}'='false','raw decision privacy boundary');
  perform pg_temp.growth_assert(v_growth#>>'{privacy,userIdentityIncluded}'='false','identity privacy boundary');
  perform pg_temp.growth_assert(v_growth#>>'{coverage,historicalCompleteness}'='FORWARD_COMPLETE_FROM_MIGRATION_PARTIAL_BEFORE','historical honesty');
  perform pg_temp.growth_assert(v_growth#>>'{summary,medianTimeToValueMinutes}' is null,'missing TTV must remain unknown');
end$$;

reset role;
rollback;
