\set ON_ERROR_STOP on
begin;

do $$
declare
  v_admin uuid:=gen_random_uuid();
  v_category uuid:=gen_random_uuid();
  v_run bigint;
  v_bistro jsonb;
  v_bar jsonb;
  v_spot uuid;
  v_job uuid;
  v_document jsonb;
  v_places jsonb:=jsonb_build_array(
    jsonb_build_object('external_id',repeat('b',64),'name','Freigabe Bistro','category','CAFE',
      'address','Prüfweg 7','lat',47.59217,'lng',7.62521,'website','https://bistro.example/','source_url','https://bistro.example/'),
    jsonb_build_object('external_id',repeat('c',64),'name','Prüfcocktail Bar','category','BAR',
      'address','Prüfweg 9','lat',47.59047,'lng',7.62531,'website','https://bar.example/','source_url','https://bar.example/'));
begin
-- backyrd:authorization-negative
  if has_function_privilege('anon','public.admin_backyrd_crawler_approve_spot_v1(integer,text,text,uuid,boolean)','execute')
    or has_function_privilege('authenticated','public.backyrd_crawler_enqueue_research_v1(integer,uuid,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.admin_backyrd_crawler_import_v1(integer)','execute')
    then raise exception 'crawler approval privileges leaked'; end if;
  begin
    perform public.admin_backyrd_crawler_approve_spot_v1(1,'0','0',v_category,true);
    raise exception 'non-admin approval allowed';
  exception when insufficient_privilege then null;
  end;

-- backyrd:authorization-positive
  insert into auth.users(id) values(v_admin);
  insert into public.profiles(id,is_admin) values(v_admin,true) on conflict(id) do update set is_admin=true;
  insert into public.categories(id,name) values(v_category,'Crawler Pipeline Fixture');
  insert into public.spots(name,address,city,country,lat,lng,category_id,created_by,status)
    values ('Prüftheater','Prüfweg 7','Basel','Switzerland',47.59217,7.62521,v_category,v_admin,'approved'),
           ('Prüfcocktail','Prüfweg 9','Basel','Switzerland',47.59047,7.62531,v_category,v_admin,'approved');

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_run:=(public.backyrd_spot_crawler_claim_v1(false)->>'id')::bigint;
  if public.backyrd_spot_crawler_finish_v1(v_run,v_places)<>2 then raise exception 'expected two candidates'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  select item into strict v_bistro from jsonb_array_elements(public.admin_backyrd_spot_crawler_preview_v1(0)->'rows') item
    where item#>>'{facts,name}'='Freigabe Bistro';
  select item into strict v_bar from jsonb_array_elements(public.admin_backyrd_spot_crawler_preview_v1(0)->'rows') item
    where item#>>'{facts,name}'='Prüfcocktail Bar';
  if v_bistro->>'can_confirm_distinct' is distinct from 'true' or v_bar->>'can_confirm_distinct' is distinct from 'false'
    then raise exception 'name vs shared address misclassified'; end if;
  begin
    perform public.admin_backyrd_crawler_approve_spot_v1((v_bistro->>'source_id')::integer,
      v_bistro->>'review_fingerprint',v_bistro->>'review_revision',v_category,false);
    raise exception 'unconfirmed shared address approved';
  exception when serialization_failure then null;
  end;
  begin
    perform public.admin_backyrd_crawler_approve_spot_v1((v_bar->>'source_id')::integer,
      v_bar->>'review_fingerprint',v_bar->>'review_revision',v_category,true);
    raise exception 'true duplicate override allowed';
  exception when serialization_failure then null;
  end;
  perform public.admin_basel_place_source_review_v1('BASEL_WEB',(v_bar->>'source_id')::integer,
    v_bar->>'review_fingerprint',v_bar->>'review_revision','DISMISSED');
  select item into strict v_bar from jsonb_array_elements(public.admin_backyrd_spot_crawler_preview_v1(0)->'rows') item
    where item#>>'{facts,name}'='Prüfcocktail Bar';
  if v_bar->>'review_state' is distinct from 'DISMISSED' or v_bar->>'imported_spot_id' is not null
    then raise exception 'rejection created or lost a spot'; end if;

  v_spot:=public.admin_backyrd_crawler_approve_spot_v1((v_bistro->>'source_id')::integer,
    v_bistro->>'review_fingerprint',v_bistro->>'review_revision',v_category,true);
  if not exists(select 1 from public.spots where id=v_spot and status='approved')
    or public.admin_backyrd_crawler_approve_spot_v1((v_bistro->>'source_id')::integer,
      v_bistro->>'review_fingerprint',v_bistro->>'review_revision',v_category,true) is distinct from v_spot
    then raise exception 'approval did not persist or replay'; end if;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_document:=jsonb_build_object('contractVersion','backyrd.world-research-batch@1.1',
    'batch',jsonb_build_object('spots',jsonb_build_array(jsonb_build_object('spotId',v_spot,'name','Freigabe Bistro'))));
  v_job:=public.backyrd_crawler_enqueue_research_v1((v_bistro->>'source_id')::integer,v_admin,v_spot,v_document);
  if v_job is null or
    public.backyrd_crawler_enqueue_research_v1((v_bistro->>'source_id')::integer,v_admin,v_spot,v_document) is distinct from v_job
    then raise exception 'research job was not persistent and idempotent'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  if public.admin_backyrd_crawler_import_v1((v_bistro->>'source_id')::integer)->>'status' is distinct from 'QUEUED'
    then raise exception 'queued research status not visible to admin'; end if;
end
$$;

rollback;
