\set ON_ERROR_STOP on
begin;

create function pg_temp.quality_uuid(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.quality_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'admin spot quality v2 failed: %',p_message; end if; end $$;
create function pg_temp.quality_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
create function pg_temp.quality_result(p_issue text default 'all') returns jsonb
language sql security definer set search_path=public,pg_catalog as $$
  select public.admin_spot_quality_v2(1000,0,null,p_issue)
$$;
create function pg_temp.quality_summary_count(p_issue text) returns integer
language sql security definer set search_path=public,pg_catalog as $$
  select case p_issue
    when 'missing_description' then (public.admin_spot_quality_v2(1000,0,null,'all')#>>'{summary,missing_description}')::integer
    when 'missing_photo' then (public.admin_spot_quality_v2(1000,0,null,'all')#>>'{summary,missing_photo}')::integer
    when 'missing_opening_hours' then (public.admin_spot_quality_v2(1000,0,null,'all')#>>'{summary,missing_opening_hours}')::integer
    when 'missing_taxonomies' then (public.admin_spot_quality_v2(1000,0,null,'all')#>>'{summary,missing_taxonomies}')::integer
    when 'missing_google_place_id' then (public.admin_spot_quality_v2(1000,0,null,'all')#>>'{summary,missing_google_place_id}')::integer
  end
$$;
create function pg_temp.quality_mutate(p_action text,p_spot uuid) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  case p_action
    when 'description' then
      insert into public.spot_descriptions(spot_id,admin_description,admin_keywords,content_status)
        values(p_spot,'A canonical Admin description that must be visible to operational quality immediately.',array['quality'],'published')
        on conflict(spot_id) do update set admin_description=excluded.admin_description,admin_keywords=excluded.admin_keywords,content_status='published';
    when 'clear_description' then
      update public.spot_descriptions set admin_description=null where spot_id=p_spot;
    when 'photo' then
      insert into public.spot_photos(spot_id,url) values(p_spot,'https://example.invalid/quality.jpg');
    when 'hours' then
      insert into public.spot_hours(spot_id,day_of_week,open_time,close_time,idx) values(p_spot,'monday','09:00','18:00',0);
    when 'google' then
      update public.spots set google_place_id='quality-place-id' where id=p_spot;
    when 'taxonomy' then
      insert into public.spot_taxonomies(spot_id,taxonomy_node_id,source,is_verified)
        select p_spot,id,'admin',true from public.taxonomy_nodes order by id limit 4;
    else raise exception 'unknown quality test mutation';
  end case;
end $$;
create function pg_temp.quality_table_count(p_table text) returns bigint
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_count bigint;
begin
  if p_table='evidence' then select count(*) into v_count from public.backyrd_spot_intelligence_evidence_v1;
  elsif p_table='facts' then select count(*) into v_count from public.backyrd_spot_accepted_facts_v1;
  elsif p_table='target_taxonomy' then select count(*) into v_count from public.spot_taxonomies where spot_id=pg_temp.quality_uuid('quality-target');
  else raise exception 'unknown quality test table'; end if;
  return v_count;
end $$;

do $$
declare
  v_admin uuid:=pg_temp.quality_uuid('quality-admin');
  v_user uuid:=pg_temp.quality_uuid('quality-user');
  v_target uuid:=pg_temp.quality_uuid('quality-target');
  v_fixture uuid:=pg_temp.quality_uuid('quality-fixture');
  v_archived uuid:=pg_temp.quality_uuid('quality-archived');
  v_duplicate_a uuid:=pg_temp.quality_uuid('quality-duplicate-a');
  v_duplicate_b uuid:=pg_temp.quality_uuid('quality-duplicate-b');
  v_category uuid;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',v_admin,'authenticated','authenticated','quality-admin@invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','quality-user@invalid','','{}','{}',now(),now());
  update public.profiles set is_admin=true where id=v_admin;
  insert into public.admin_users(user_id,role) values(v_admin,'super_admin');
  select id into v_category from public.categories order by id limit 1;

  insert into public.spots(id,name,address,city,country,lat,lng,status,category_id,data_origin,google_photo_enabled) values
    (v_target,'Quality Contract Target','Teststrasse 1','Basel','Schweiz',47.55,7.59,'approved',v_category,'REAL',false),
    (v_fixture,'Quality Fixture Excluded','Teststrasse 2','Basel','Schweiz',47.55,7.59,'approved',v_category,'FIXTURE',false),
    (v_archived,'Quality Archived Excluded','Teststrasse 3','Basel','Schweiz',47.55,7.59,'archived',v_category,'REAL',false),
    (v_duplicate_a,'Quality Duplicate Contract','Same 4','Basel','Schweiz',47.55,7.59,'approved',v_category,'REAL',false),
    (v_duplicate_b,'Quality Duplicate Contract','Same 4','Basel','Schweiz',47.55,7.59,'approved',v_category,'REAL',false);

  perform pg_temp.quality_actor(v_user);
end $$;

set local role authenticated;
do $$
declare v_denied boolean:=false;
begin
  begin perform public.admin_spot_quality_v2(10,0,null,'all');
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.quality_assert(v_denied,'ordinary user could read quality operations');
  v_denied:=false;
  begin perform public.admin_spots_operations_v2(now()-interval '1 day',now(),10,0,null,'all');
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.quality_assert(v_denied,'ordinary user could read paginated Spot operations');
  v_denied:=false;
  begin perform public.admin_review_spots_v2();
  exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.quality_assert(v_denied,'ordinary user could read Admin review operations');
end $$;
reset role;

select pg_temp.quality_actor(pg_temp.quality_uuid('quality-admin'));
set local role authenticated;

do $$
declare
  v_target uuid:=pg_temp.quality_uuid('quality-target');
  v_result jsonb;
  v_before integer;
  v_after integer;
  v_description_after integer;
  v_evidence_before bigint;
  v_facts_before bigint;
begin
  v_result:=public.admin_spot_quality_v2(1000,0,null,'all');
  perform pg_temp.quality_assert((v_result#>>'{freshness,mode}')='live','freshness is not explicit live computation');
  perform pg_temp.quality_assert(not exists(select 1 from jsonb_array_elements(v_result->'rows') r where r->>'spot_id' in (pg_temp.quality_uuid('quality-fixture')::text,pg_temp.quality_uuid('quality-archived')::text)),'fixture or archived Spot leaked into normal quality universe');
  perform pg_temp.quality_assert(exists(select 1 from jsonb_array_elements(v_result->'rows') r where r->>'spot_id'=v_target::text),'active Product Spot missing from quality universe');
  v_result:=public.admin_spots_operations_v2(now()-interval '1 day',now(),2,0,'Quality','approved');
  perform pg_temp.quality_assert((v_result->>'filtered_total')::integer=3,'server-side Spot filtering or fixture exclusion is wrong');
  perform pg_temp.quality_assert(jsonb_array_length(v_result->'spots')=2,'server-side Spot pagination ignored requested page size');
  perform pg_temp.quality_assert(v_result#>>'{freshness,mode}'='live','Spot list freshness is not explicit');
  perform pg_temp.quality_assert(public.admin_spot_detail_operations_v2(v_target,now()-interval '1 day',now())->'spot' is not null,'advertised Spot row resolves to no detail');
  perform pg_temp.quality_assert(public.admin_spot_detail_operations_v2(pg_temp.quality_uuid('quality-fixture'),now()-interval '1 day',now()) is null,'fixture Spot detail was exposed');
  perform pg_temp.quality_assert(exists(select 1 from public.admin_review_spots_v2() where id=v_target),'active Product Spot missing from review queue');
  perform pg_temp.quality_assert(not exists(select 1 from public.admin_review_spots_v2() where id in(pg_temp.quality_uuid('quality-fixture'),pg_temp.quality_uuid('quality-archived'))),'synthetic or archived Spot leaked into review queue');
  perform pg_temp.quality_assert(public.admin_review_spot_detail_v2(v_target)->'spot' is not null,'review queue row resolves to no detail');
  perform pg_temp.quality_assert(public.admin_review_spot_detail_v2(pg_temp.quality_uuid('quality-fixture')) is null,'fixture review detail was exposed');

  v_evidence_before:=pg_temp.quality_table_count('evidence');
  v_facts_before:=pg_temp.quality_table_count('facts');

  foreach v_result in array array[
    jsonb_build_object('issue','missing_description'),
    jsonb_build_object('issue','missing_photo'),
    jsonb_build_object('issue','missing_opening_hours'),
    jsonb_build_object('issue','missing_taxonomies'),
    jsonb_build_object('issue','missing_google_place_id'),
    jsonb_build_object('issue','possible_duplicate')
  ] loop
    perform pg_temp.quality_assert(
      (public.admin_spot_quality_v2(1000,0,null,v_result->>'issue')->>'filtered_total')::integer =
      jsonb_array_length(public.admin_spot_quality_v2(1000,0,null,v_result->>'issue')->'rows'),
      'filtered count differs from queue for '||(v_result->>'issue')
    );
  end loop;

  perform pg_temp.quality_assert(pg_temp.quality_table_count('evidence')=v_evidence_before,'quality read changed Product evidence');
  perform pg_temp.quality_assert(pg_temp.quality_table_count('facts')=v_facts_before,'quality read changed accepted Gold facts');

  v_before:=pg_temp.quality_summary_count('missing_description');
  perform pg_temp.quality_mutate('description',v_target);
  v_after:=pg_temp.quality_summary_count('missing_description');
  v_description_after:=v_after;
  perform pg_temp.quality_assert(v_after=v_before-1,'Admin description did not reduce missing-description count');
  perform pg_temp.quality_assert(jsonb_array_length(pg_temp.quality_result('missing_description')->'rows')=(pg_temp.quality_result('missing_description')->>'filtered_total')::integer,'description queue diverged after write');

  v_before:=pg_temp.quality_summary_count('missing_photo');
  perform pg_temp.quality_mutate('photo',v_target);
  v_after:=pg_temp.quality_summary_count('missing_photo');
  perform pg_temp.quality_assert(v_after=v_before-1,'canonical photo did not reduce missing-photo count');

  v_before:=pg_temp.quality_summary_count('missing_opening_hours');
  perform pg_temp.quality_mutate('hours',v_target);
  v_after:=pg_temp.quality_summary_count('missing_opening_hours');
  perform pg_temp.quality_assert(v_after=v_before-1,'hours did not reduce missing-hours count');

  v_before:=pg_temp.quality_summary_count('missing_google_place_id');
  perform pg_temp.quality_mutate('google',v_target);
  v_after:=pg_temp.quality_summary_count('missing_google_place_id');
  perform pg_temp.quality_assert(v_after=v_before-1,'Google linkage did not reduce missing-linkage count');

  v_before:=pg_temp.quality_summary_count('missing_taxonomies');
  perform pg_temp.quality_mutate('taxonomy',v_target);
  perform pg_temp.quality_assert(pg_temp.quality_table_count('target_taxonomy')=4,'test catalog has fewer than four taxonomy nodes');
  v_after:=pg_temp.quality_summary_count('missing_taxonomies');
  perform pg_temp.quality_assert(v_after=v_before-1,'taxonomy completion did not reduce taxonomy queue');

  perform pg_temp.quality_mutate('clear_description',v_target);
  perform pg_temp.quality_assert(pg_temp.quality_summary_count('missing_description')=v_description_after+1,'description removal did not return Spot to queue');
end $$;

reset role;
select pg_temp.quality_assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
select pg_temp.quality_assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
rollback;
