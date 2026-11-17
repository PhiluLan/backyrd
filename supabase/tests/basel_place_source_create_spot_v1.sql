\set ON_ERROR_STOP on
begin;

-- Isolated synthetic data. The rollback covers the catalog and the source.
do $$
declare
  v_actor uuid:=gen_random_uuid();
  v_regular uuid:=gen_random_uuid();
  v_category uuid:=gen_random_uuid();
  v_run bigint;
  v_row jsonb;
  v_spot uuid;
  v_credit text;
  v_count bigint;
begin
  select count(*) into v_count from public.spots;
  insert into auth.users(id) values(v_actor),(v_regular);
  insert into public.profiles(id,is_admin) values(v_actor,true),(v_regular,false)
    on conflict(id) do update set is_admin=excluded.is_admin;
  insert into public.categories(id,name) values(v_category,'Import Fixture Category');
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id,status,finished_at,source_count)
    values('BASEL_POI',-910010,'COMPLETE',now(),2) returning id into v_run;
  insert into world_knowledge_private.basel_spot_source_rows_v1(source_key,source_id,facts,last_seen_run_id,changed_at)
    values
    ('BASEL_POI',910010,'{"name":"Quick Import Fixture","category":"OTHER_PLACE","lat":47.508,"lng":7.542,"address":"Testweg 5","city":"Basel","phone":"+41 61 001 00 00","website":"https://example.test/spot","equipment":[]}',v_run,now()),
    ('BASEL_POI',910012,'{"name":"Duplicate Import Fixture","category":"OTHER_PLACE","lat":47.50805,"lng":7.54205,"equipment":[]}',v_run,now());

-- backyrd:authorization-negative
  if has_function_privilege('anon','public.admin_basel_place_source_create_spot_v1(text,integer,text,text,uuid)','execute')
    or has_function_privilege('service_role','public.admin_basel_place_source_create_spot_v1(text,integer,text,text,uuid)','execute')
    or has_table_privilege('authenticated','world_knowledge_private.basel_spot_source_imports_v1','select')
    then raise exception 'import privileges leaked'; end if;
  perform set_config('request.jwt.claim.sub',v_regular::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_regular,'role','authenticated')::text,true);
  begin
    perform public.admin_basel_place_source_create_spot_v1('BASEL_POI',910010,'x','0',v_category);
    raise exception 'non-admin spot creation allowed';
  exception when insufficient_privilege then null;
  end;

-- backyrd:authorization-positive
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  v_row:=public.admin_basel_place_source_preview_v1('BASEL_POI',910010)#>'{rows,0}';
  if v_row->>'state' is distinct from 'NEW' then raise exception 'fixture has an unexpected match'; end if;
  perform public.admin_basel_place_source_review_v1('BASEL_POI',910010,v_row->>'review_fingerprint',v_row->>'review_revision','REVIEWED');
  if (select count(*) from public.spots)<>v_count then raise exception 'on hold published a spot'; end if;
  begin
    perform public.admin_basel_place_source_create_spot_v1('BASEL_POI',910010,v_row->>'review_fingerprint',v_row->>'review_revision',v_category);
    raise exception 'stale review revision allowed';
  exception when serialization_failure then null;
  end;
  v_row:=public.admin_basel_place_source_preview_v1('BASEL_POI',910010)#>'{rows,0}';
  if v_row->>'review_state' is distinct from 'REVIEWED' then raise exception 'on hold state not saved'; end if;
  begin
    perform public.admin_basel_place_source_create_spot_v1('BASEL_POI',910010,v_row->>'review_fingerprint',v_row->>'review_revision',null);
    raise exception 'unmapped category allowed';
  exception when invalid_parameter_value then
    if sqlerrm<>'spot_import_category_required' then raise; end if;
  end;
  v_spot:=public.admin_basel_place_source_create_spot_v1('BASEL_POI',910010,v_row->>'review_fingerprint',v_row->>'review_revision',v_category);
  if not exists(select 1 from public.spots where id=v_spot and status='approved' and created_by=v_actor
    and name='Quick Import Fixture' and address='Testweg 5' and city='Basel' and category_id=v_category
    and phone='+41 61 001 00 00' and website='https://example.test/spot' and not google_photo_enabled)
    then raise exception 'approved spot lacks source details'; end if;
  if public.admin_basel_place_source_create_spot_v1('BASEL_POI',910010,v_row->>'review_fingerprint',v_row->>'review_revision',v_category)
      is distinct from v_spot or (select count(*) from public.spots)<>v_count+1
    then raise exception 'retry created another spot'; end if;
  v_row:=public.admin_basel_place_source_preview_v1('BASEL_POI',910010)#>'{rows,0}';
  if v_row->>'review_state' is distinct from 'IMPORTED' or (v_row->>'imported_spot_id')::uuid is distinct from v_spot
    then raise exception 'import is not linked in preview'; end if;

  v_row:=public.admin_basel_place_source_preview_v1('BASEL_POI',910012)#>'{rows,0}';
  begin
    perform public.admin_basel_place_source_create_spot_v1('BASEL_POI',910012,v_row->>'review_fingerprint',v_row->>'review_revision',v_category);
    raise exception 'possible duplicate was created';
  exception when serialization_failure then null;
  end;

  select credit into v_credit from public.spot_place_source_credit_v1(v_spot);
  if v_credit is distinct from 'Geodaten Kanton Basel-Stadt via Open Data Basel-Stadt'
    then raise exception 'imported approved spot lacks attribution'; end if;
  update public.spots set status='archived' where id=v_spot;
  if exists(select 1 from public.spot_place_source_credit_v1(v_spot)) then
    raise exception 'archived spot attribution escaped';
  end if;
end;
$$;

rollback;
