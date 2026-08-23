\set ON_ERROR_STOP on
begin;

create function pg_temp.ux_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.ux_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'admin dashboard ux v1 failed: %',p_message; end if; end $$;
create function pg_temp.ux_actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;

do $$
declare admin_id uuid:=pg_temp.ux_uuid('ux-admin');user_id uuid:=pg_temp.ux_uuid('ux-user');denied boolean:=false;
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',admin_id,'authenticated','authenticated','ux-admin@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',user_id,'authenticated','authenticated','ux-user@invalid','','{}','{}',now(),now());
 update public.profiles set is_admin=true where id=admin_id;
 insert into public.admin_users(user_id,role) values(admin_id,'super_admin');

 perform pg_temp.ux_actor(user_id);
 begin
   perform * from public.admin_spot_readiness_worklist_v1(array[]::uuid[]);
 exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.ux_assert(denied,'ordinary user could read admin Gold worklist');

 perform pg_temp.ux_actor(admin_id);
 perform pg_temp.ux_assert((select count(*)=0 from public.admin_spot_readiness_worklist_v1(array[]::uuid[])),'empty requested worklist was not deterministic');
 perform pg_temp.ux_assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
 perform pg_temp.ux_assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
end $$;

rollback;
