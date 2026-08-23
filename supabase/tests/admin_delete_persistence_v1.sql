\set ON_ERROR_STOP on
begin;

create function pg_temp.del_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.del_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'admin delete persistence failed: %',p_message; end if; end $$;
create function pg_temp.del_actor(p_user uuid,p_role text default 'authenticated') returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role',p_role,true);
end $$;
create function pg_temp.del_spot_status(p_spot uuid) returns text language sql security definer set search_path=public,pg_catalog as $$
 select status::text from public.spots where id=p_spot
$$;
create function pg_temp.del_photo_exists(p_photo bigint) returns boolean language sql security definer set search_path=public,pg_catalog as $$
 select exists(select 1 from public.spot_photos where id=p_photo)
$$;

do $$
declare
 founder uuid:=pg_temp.del_uuid('delete-founder');owner_id uuid:=pg_temp.del_uuid('delete-owner');other_id uuid:=pg_temp.del_uuid('delete-other');
 photo_spot uuid:=pg_temp.del_uuid('delete-photo-spot');archive_spot uuid:=pg_temp.del_uuid('delete-archive-spot');other_spot uuid:=pg_temp.del_uuid('delete-other-spot');
 category_id uuid;
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',founder,'authenticated','authenticated','delete-founder@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','delete-owner@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',other_id,'authenticated','authenticated','delete-other@invalid','','{}','{}',now(),now());
 -- Reproduction intentionally leaves profiles.is_admin=false. The dashboard
 -- recognizes admin_users, while the old photo DELETE RLS did not.
 insert into public.admin_users(user_id,role) values(founder,'super_admin');
 select id into category_id from public.categories order by name limit 1;
 insert into public.spots(id,name,address,city,country,lat,lng,status,category_id,data_origin,owner_id,header_photo_path) values
 (photo_spot,'Photo Delete Fixture','Fixture 1','Basel','Switzerland',47.55,7.59,'approved',category_id,'TEST',owner_id,'http://127.0.0.1:54321/storage/v1/object/public/spot-photos/gallery-delete-test.jpg'),
 (archive_spot,'Archive Fixture','Fixture 2','Basel','Switzerland',47.56,7.60,'approved',category_id,'TEST',owner_id,null),
 (other_spot,'Other Fixture','Fixture 3','Basel','Switzerland',47.57,7.61,'approved',category_id,'TEST',other_id,null);
 insert into public.spot_photos(spot_id,url,uploaded_by) values
 (photo_spot,'http://127.0.0.1:54321/storage/v1/object/public/spot-photos/gallery-delete-test.jpg',owner_id),
 (archive_spot,'http://127.0.0.1:54321/storage/v1/object/public/spot-photos/archive-retained.jpg',owner_id);
 insert into public.spot_hours(spot_id,idx,day_of_week,open_time,close_time) values(archive_spot,0,'Montag','10:00','17:00');
 insert into public.reviews(spot_id,user_id,text) values(archive_spot,other_id,'Historical review retained by archive');
 insert into public.backyrd_gold_authoring_owner_allowlist_v1(user_id,reason) values(owner_id,'delete security test');
end $$;

-- Reproduce both old false-success paths.
set local role authenticated;
select pg_temp.del_actor(pg_temp.del_uuid('delete-founder'));
do $$ declare p bigint;begin
 select id into p from public.spot_photos where spot_id=pg_temp.del_uuid('delete-photo-spot');
 delete from public.spot_photos where id=p;
 perform pg_temp.del_assert(pg_temp.del_photo_exists(p),'old direct photo delete unexpectedly persisted');
 delete from public.spots where id=pg_temp.del_uuid('delete-archive-spot');
 perform pg_temp.del_assert(pg_temp.del_spot_status(pg_temp.del_uuid('delete-archive-spot'))='approved','old direct spot delete unexpectedly persisted');
end $$;

-- Service-only two-phase photo deletion confirms exact identity, preserves the
-- DB row until Storage has succeeded, then deletes DB state and header together.
reset role;
set local role service_role;
select pg_temp.del_actor(pg_temp.del_uuid('delete-founder'),'service_role');
do $$
declare p bigint;prepared jsonb;finalized jsonb;deletion_id uuid;
begin
 select id into p from public.spot_photos where spot_id=pg_temp.del_uuid('delete-photo-spot');
 prepared:=public.backyrd_admin_prepare_spot_photo_delete_v1(
   p,pg_temp.del_uuid('delete-photo-spot'),pg_temp.del_uuid('delete-founder'),pg_temp.del_uuid('delete-photo-request'),'gallery-delete-test.jpg'
 );
 deletion_id:=(prepared->>'deletionId')::uuid;
 perform pg_temp.del_assert(prepared->>'state'='PENDING','photo deletion was not prepared');
 perform pg_temp.del_assert(pg_temp.del_photo_exists(p),'prepare deleted DB state before Storage completion');
 finalized:=public.backyrd_admin_finalize_spot_photo_delete_v1(deletion_id,pg_temp.del_uuid('delete-founder'),'DELETED');
 perform pg_temp.del_assert((finalized->>'dbDeleted')::boolean,'finalize did not confirm DB deletion');
 perform pg_temp.del_assert(not pg_temp.del_photo_exists(p),'photo DB row survived finalize/reload');
 perform pg_temp.del_assert((select header_photo_path is null from public.spots where id=pg_temp.del_uuid('delete-photo-spot')),'active header reference survived photo deletion');
 finalized:=public.backyrd_admin_finalize_spot_photo_delete_v1(deletion_id,pg_temp.del_uuid('delete-founder'),'DELETED');
 perform pg_temp.del_assert((finalized->>'replayed')::boolean,'response-loss finalize replay was not idempotent');

 begin
  perform public.backyrd_admin_prepare_spot_photo_delete_v1(999999,pg_temp.del_uuid('delete-photo-spot'),pg_temp.del_uuid('delete-founder'),pg_temp.del_uuid('delete-missing-request'),'missing.jpg');
  raise exception 'zero-row photo delete unexpectedly succeeded';
 exception when invalid_parameter_value then perform pg_temp.del_assert(sqlerrm='photo_not_found','zero-row photo delete returned wrong failure'); end;
 begin
  perform public.backyrd_admin_prepare_spot_photo_delete_v1((select id from public.spot_photos where spot_id=pg_temp.del_uuid('delete-archive-spot')),pg_temp.del_uuid('delete-other-spot'),pg_temp.del_uuid('delete-founder'),pg_temp.del_uuid('delete-cross-spot-request'),'archive-retained.jpg');
  raise exception 'cross-Spot photo delete unexpectedly succeeded';
 exception when invalid_parameter_value then perform pg_temp.del_assert(sqlerrm='photo_not_found','cross-Spot denial returned wrong failure'); end;
 begin
  perform public.backyrd_admin_prepare_spot_photo_delete_v1((select id from public.spot_photos where spot_id=pg_temp.del_uuid('delete-archive-spot')),pg_temp.del_uuid('delete-archive-spot'),pg_temp.del_uuid('delete-other'),pg_temp.del_uuid('delete-unauthorized-photo'),'archive-retained.jpg');
  raise exception 'non-admin photo delete unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;

-- Archival is authenticated Founder/Admin-only and retains all historical rows.
reset role;
set local role authenticated;
select pg_temp.del_actor(pg_temp.del_uuid('delete-founder'));
do $$
declare result jsonb;v_spot uuid:=pg_temp.del_uuid('delete-archive-spot');photo_count bigint;review_count bigint;hour_count bigint;
begin
 select count(*) into photo_count from public.spot_photos where spot_id=v_spot;
 select count(*) into review_count from public.reviews where spot_id=v_spot;
 select count(*) into hour_count from public.spot_hours where spot_id=v_spot;
 result:=public.backyrd_admin_archive_spot_v1(v_spot,pg_temp.del_uuid('archive-request'));
 perform pg_temp.del_assert((result->>'archived')::boolean and result->>'status'='archived','archive response was not confirmed');
 perform pg_temp.del_assert(pg_temp.del_spot_status(v_spot)='archived','fresh read did not remain archived');
 perform pg_temp.del_assert((select count(*) from public.spot_photos where spot_id=v_spot)=photo_count,'archive deleted photos');
 perform pg_temp.del_assert((select count(*) from public.reviews where spot_id=v_spot)=review_count,'archive corrupted reviews');
 perform pg_temp.del_assert((select count(*) from public.spot_hours where spot_id=v_spot)=hour_count,'archive deleted opening hours');
 perform pg_temp.del_assert(not exists(select 1 from public.spots where id=v_spot and status='approved'),'archived Spot remains in active Product status');
 result:=public.backyrd_admin_archive_spot_v1(v_spot,pg_temp.del_uuid('archive-request-2'));
 perform pg_temp.del_assert((result->>'replayed')::boolean,'double archive was not idempotent');
end $$;

select pg_temp.del_actor(pg_temp.del_uuid('delete-owner'));
do $$ begin
 begin
  perform public.backyrd_admin_archive_spot_v1(pg_temp.del_uuid('delete-archive-spot'),pg_temp.del_uuid('owner-archive-request'));
  raise exception 'owner entered Founder/Admin archive boundary';
 exception when insufficient_privilege then null; end;
end $$;
select pg_temp.del_actor(pg_temp.del_uuid('delete-other'));
do $$ begin
 begin
  perform public.backyrd_admin_archive_spot_v1(pg_temp.del_uuid('delete-archive-spot'),pg_temp.del_uuid('cross-owner-archive-request'));
  raise exception 'cross-owner archive unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
select pg_temp.del_assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
select pg_temp.del_assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
rollback;
