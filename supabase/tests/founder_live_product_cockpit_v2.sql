\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.founder_live_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'founder live cockpit test failed: %',p_message;end if;end$$;
create function pg_temp.founder_live_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end$$;

select pg_temp.founder_live_assert(
  not has_function_privilege('anon','public.founder_live_product_overview_v2()','execute'),
  'anon execute grant'
);
select pg_temp.founder_live_assert(
  has_function_privilege('authenticated','public.founder_live_product_overview_v2()','execute'),
  'authenticated admin gateway missing'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','79000000-0000-4000-8000-000000000001','authenticated','authenticated','founder-live-admin@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','79000000-0000-4000-8000-000000000002','authenticated','authenticated','founder-live-user@invalid','','{}','{}',now(),now());
update public.profiles set is_admin=true where id='79000000-0000-4000-8000-000000000001';
insert into public.admin_users(user_id,role) values('79000000-0000-4000-8000-000000000001','super_admin');

set local role authenticated;
select pg_temp.founder_live_actor('79000000-0000-4000-8000-000000000002');
do $$begin
  perform public.founder_live_product_overview_v2();
  raise exception 'non-admin cockpit accepted';
exception when insufficient_privilege then
  perform pg_temp.founder_live_assert(sqlerrm='admin_required','non-admin denial reason');
end$$;

select pg_temp.founder_live_actor('79000000-0000-4000-8000-000000000001');
do $$declare v_overview jsonb;begin
  v_overview:=public.founder_live_product_overview_v2();
  perform pg_temp.founder_live_assert(v_overview->>'contractVersion'='backyrd.founder-live-product-overview@2.0','contract version');
  perform pg_temp.founder_live_assert(v_overview#>>'{product,engine}'='DECISION_VNEXT_PRODUCT_V1','engine identity');
  perform pg_temp.founder_live_assert(v_overview#>>'{product,singleRoute}'='true','single route');
  perform pg_temp.founder_live_assert(v_overview#>>'{product,legacyFallback}'='false','legacy fallback boundary');
  perform pg_temp.founder_live_assert(v_overview#>>'{activity,errorTelemetry,status}'='NOT_CANONICALLY_AVAILABLE','error telemetry must stay honest');
  perform pg_temp.founder_live_assert(v_overview#>>'{privacy,aggregateOnly}'='true','aggregate privacy boundary');
  perform pg_temp.founder_live_assert(v_overview#>>'{privacy,rawDecisionTextIncluded}'='false','raw decision privacy boundary');
  perform pg_temp.founder_live_assert(v_overview#>>'{privacy,userIdentityIncluded}'='false','user identity privacy boundary');
end$$;

reset role;
rollback;
