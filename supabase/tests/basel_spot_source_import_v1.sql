\set ON_ERROR_STOP on
begin;

-- Execute against an isolated database. No network requests are required.
insert into public.spots(name,lat,lng,status)
values ('Spielplatz Backyrd Import Fixture',47.551,7.59,'pending'),
       ('Nachbar Backyrd Import Fixture',47.565,7.57,'pending');

do $$
declare
  v_run bigint;
  v_next bigint;
  v_third bigint;
  v_bad bigint;
  v_actor uuid := gen_random_uuid();
  v_result jsonb;
  v_count integer;
  v_initial jsonb := '{"total_count":3,"results":[
    {"id":910000001,"spielplatz_name":"Backyrd Import Fixture","oeffnungszeiten":"07:00–23:00","spielgeraete_liste":["Rutsche"],"geo_point_2d":{"lat":47.551,"lon":7.59}},
    {"id":910000002,"spielplatz_name":"Neuer Backyrd Import Fixture","geo_point_2d":{"lat":47.517,"lon":7.545}},
    {"id":910000003,"spielplatz_name":"Andere Anlage","geo_point_2d":{"lat":47.56501,"lon":7.57}}
  ]}';
begin
  select count(*) into v_count from public.spots;
  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id) values (-101) returning id into v_run;
  if world_knowledge_private.basel_spot_source_apply_v1(v_run,v_initial) <> 3 then raise exception 'wrong snapshot count'; end if;

  -- Verify replay and source changes independently of spot publication.
  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id) values (-102) returning id into v_next;
  perform world_knowledge_private.basel_spot_source_apply_v1(v_next,v_initial);
  if exists(select 1 from world_knowledge_private.basel_spot_source_rows_v1 where source_id=910000001 and previous_facts is not null)
    then raise exception 'unchanged replay was marked as a change'; end if;

  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id) values (-103) returning id into v_third;
  perform world_knowledge_private.basel_spot_source_apply_v1(v_third,
    jsonb_set(jsonb_set(v_initial #- '{results,1}', '{total_count}', '2'),'{results,0,oeffnungszeiten}','"08:00–22:00"'));
  if (select count(*) from public.spots) <> v_count then raise exception 'catalog was modified by import'; end if;

  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id) values (-104) returning id into v_bad;
  begin
    perform world_knowledge_private.basel_spot_source_apply_v1(v_bad,
      jsonb_set(v_initial, '{total_count}', '41'));
    raise exception 'accepted a partial snapshot';
  exception when raise_exception then
    if sqlerrm <> 'basel_spot_source_incomplete_snapshot' then raise; end if;
  end;
  update world_knowledge_private.basel_spot_source_runs_v1 set status='FAILED' where id=v_bad;

  -- Admin RPC is intentionally callable via the authenticated API, but denies non-admins.
  begin
    perform public.admin_basel_spot_source_preview_v1();
    raise exception 'preview unexpectedly available without admin';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.admin_basel_spot_source_preview_v1(integer)','execute')
    or has_function_privilege('anon','public.admin_basel_spot_source_start_v1()','execute')
    or has_table_privilege('authenticated','world_knowledge_private.basel_spot_source_rows_v1','select')
    or has_function_privilege('authenticated','world_knowledge_private.basel_spot_source_apply_v1(bigint,jsonb)','execute')
    then raise exception 'unexpected role grants'; end if;

  insert into auth.users(id) values(v_actor);
  insert into public.profiles(id,is_admin) values(v_actor,true) on conflict(id) do update set is_admin=true;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);

  v_result:=public.admin_basel_spot_source_preview_v1(910000001)->'rows'->0;
  if v_result->>'state' is distinct from 'MATCHED'
    or v_result#>>'{previous_facts,hours}' is distinct from '07:00–23:00'
    or v_result#>>'{facts,hours}' is distinct from '08:00–22:00'
    then raise exception 'wrong matched spot or change presentation: %',v_result; end if;
  if public.admin_basel_spot_source_preview_v1(910000002)#>>'{rows,0,state}' is distinct from 'MISSING'
    or public.admin_basel_spot_source_preview_v1(910000003)#>>'{rows,0,state}' is distinct from 'REVIEW'
    then raise exception 'missing or nearby candidate did not receive the expected status'; end if;
end;
$$;

rollback;
