\set ON_ERROR_STOP on
begin;

do $$
declare
  v_admin uuid:=gen_random_uuid();
  v_rows jsonb;
  v_page jsonb;
  v_item jsonb;
  v_second jsonb;
  v_id integer;
  v_spot_count bigint;
begin
  select count(*) into v_spot_count from public.spots;
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'name','Overture Fixture '||n,
    'category','CAFE','lat',47.55,'lng',7.575,'confidence',0.9,
    'sources',jsonb_build_array(jsonb_build_object('dataset','Foursquare','license','Apache-2.0')),
    'hours','24/7')) into v_rows from generate_series(1,51) n;

-- backyrd:authorization-negative
  if has_function_privilege('anon','public.admin_basel_overture_import_v1(text,jsonb)','execute')
    or has_function_privilege('service_role','public.admin_basel_overture_import_v1(text,jsonb)','execute')
    or has_function_privilege('anon','public.admin_basel_overture_preview_v1(integer)','execute') then
    raise exception 'overture privileges leaked';
  end if;
  begin
    perform public.admin_basel_overture_import_v1('2026-10-21.0',v_rows);
    raise exception 'non-admin import allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_basel_overture_preview_v1(0);
    raise exception 'non-admin preview allowed';
  exception when insufficient_privilege then null;
  end;

-- backyrd:authorization-positive
  insert into auth.users(id) values(v_admin);
  insert into public.profiles(id,is_admin) values(v_admin,true) on conflict(id) do update set is_admin=true;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  if public.admin_basel_overture_import_v1('2026-10-21.0',v_rows)<>51 then raise exception 'wrong import count'; end if;
  if public.admin_basel_overture_import_v1('2026-10-21.0',v_rows)<>51 then raise exception 'wrong replay count'; end if;
  if (select count(*) from world_knowledge_private.basel_spot_source_runs_v1 where source_key='BASEL_OVERTURE')<>1
    then raise exception 'replay created a new run'; end if;

  v_page:=public.admin_basel_overture_preview_v1(0);
  v_second:=public.admin_basel_overture_preview_v1((v_page->>'next_after')::integer);
  if jsonb_array_length(v_page->'rows')<>50 or jsonb_array_length(v_second->'rows')<>1 or v_second->>'next_after' is not null
    then raise exception 'wrong pagination'; end if;
  select row into strict v_item from jsonb_array_elements((v_page->'rows')||(v_second->'rows')) row
    where row#>>'{facts,external_id}'=v_rows#>>'{0,id}';
  v_id:=(v_item->>'source_id')::integer;
  if v_item#>>'{facts,attribution,0}' is distinct from 'Foursquare (Apache-2.0)'
    or v_item#>>'{facts,hours}' is not null then raise exception 'untrusted source data escaped into facts'; end if;
  perform public.admin_basel_place_source_review_v1('BASEL_OVERTURE',v_id,v_item->>'review_fingerprint',v_item->>'review_revision','REVIEWED');

  begin
    perform public.admin_basel_overture_import_v1('2026-11-01.0',jsonb_build_array(v_rows->0));
    raise exception 'short snapshot allowed';
  exception when invalid_parameter_value then
    if sqlerrm<>'overture_snapshot_incomplete' then raise; end if;
  end;
  if public.admin_basel_overture_import_v1('2026-11-01.0',v_rows)<>51 then raise exception 'new version failed'; end if;
  if public.admin_basel_place_source_preview_v1('BASEL_OVERTURE',v_id)#>>'{rows,0,review_state}' is distinct from 'REVIEWED'
    then raise exception 'unchanged reviewed place reopened'; end if;
  perform public.admin_basel_overture_import_v1('2026-11-11.0',jsonb_set(v_rows,'{0,name}','"New name"'));
  v_item:=public.admin_basel_place_source_preview_v1('BASEL_OVERTURE',v_id)#>'{rows,0}';
  if v_item#>>'{facts,name}' is distinct from 'New name' or v_item->>'review_state' is distinct from 'OPEN'
    or v_item#>>'{previous_facts,name}' is distinct from 'Overture Fixture 1'
    then raise exception 'changed place lost its identity/history'; end if;

  perform public.admin_basel_spot_source_settings_v1('BASEL_OVERTURE',false,'MANUAL','1');
  begin
    perform public.admin_basel_overture_import_v1('2026-11-18.0',v_rows);
    raise exception 'paused source allowed import';
  exception when object_not_in_prerequisite_state then null;
  end;
  if (select count(*) from public.spots)<>v_spot_count then raise exception 'published spot catalog modified'; end if;
end;
$$;

rollback;
