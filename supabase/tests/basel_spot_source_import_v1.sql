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
  v_prior jsonb;
  v_snapshot jsonb;
  v_recheck bigint;
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

  -- backyrd:authorization-negative
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
  begin
    perform public.admin_basel_spot_source_set_review_v1(910000001,'x','0','DISMISSED');
    raise exception 'review unexpectedly writable without admin';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.admin_basel_spot_source_set_review_v1(integer,text,text,text)','execute')
    or has_table_privilege('authenticated','world_knowledge_private.basel_spot_source_reviews_v1','update')
    then raise exception 'unexpected review grants'; end if;

  -- backyrd:authorization-positive
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

  v_prior:=public.admin_basel_spot_source_preview_v2(910000001)#>'{rows,0}';
  if v_prior->>'review_state' is distinct from 'OPEN' then raise exception 'changed source should be open'; end if;
  perform public.admin_basel_spot_source_set_review_v1(910000001,v_prior->>'review_fingerprint',v_prior->>'review_revision','REVIEWED');
  v_result:=public.admin_basel_spot_source_preview_v2(910000001)#>'{rows,0}';
  if v_result->>'review_state' is distinct from 'REVIEWED' then raise exception 'review was not saved'; end if;

  begin
    perform public.admin_basel_spot_source_set_review_v1(910000001,v_prior->>'review_fingerprint',v_prior->>'review_revision','DISMISSED');
    raise exception 'parallel write overrode saved review';
  exception when serialization_failure then null;
  end;

  -- A fresh successful pull of the same fields does not reopen saved work.
  v_snapshot:=jsonb_set(jsonb_set(v_initial #- '{results,1}', '{total_count}', '2'),'{results,0,oeffnungszeiten}','"08:00–22:00"');
  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id) values (-105) returning id into v_recheck;
  perform world_knowledge_private.basel_spot_source_apply_v1(v_recheck,v_snapshot);
  if public.admin_basel_spot_source_preview_v2(910000001)#>>'{rows,0,review_state}' is distinct from 'REVIEWED'
    then raise exception 'unchanged pull reopened reviewed work'; end if;
  perform public.admin_basel_spot_source_set_review_v1(910000001,v_result->>'review_fingerprint',v_result->>'review_revision','REOPENED');
  v_prior:=public.admin_basel_spot_source_preview_v2(910000001)#>'{rows,0}';
  if v_prior->>'review_state' is distinct from 'OPEN' then raise exception 'undo did not reopen'; end if;
  perform public.admin_basel_spot_source_set_review_v1(910000001,v_prior->>'review_fingerprint',v_prior->>'review_revision','DISMISSED');
  if public.admin_basel_spot_source_preview_v2(910000001)#>>'{rows,0,review_state}' is distinct from 'DISMISSED'
    then raise exception 'dismissed work still open'; end if;

  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id) values (-106) returning id into v_recheck;
  perform world_knowledge_private.basel_spot_source_apply_v1(v_recheck,
    jsonb_set(v_snapshot,'{results,0,oeffnungszeiten}','"09:00–18:00"'));
  if public.admin_basel_spot_source_preview_v2(910000001)#>>'{rows,0,review_state}' is distinct from 'OPEN'
    then raise exception 'new source details were hidden by previous review'; end if;

  v_prior:=public.admin_basel_spot_source_preview_v2(910000003)#>'{rows,0}';
  perform public.admin_basel_spot_source_set_review_v1(910000003,v_prior->>'review_fingerprint',v_prior->>'review_revision','DISMISSED');
  update public.spots set status='archived' where name='Nachbar Backyrd Import Fixture';
  if public.admin_basel_spot_source_preview_v2(910000003)#>>'{rows,0,review_state}' is distinct from 'OPEN'
    then raise exception 'changed candidate catalog status did not reopen the proposal'; end if;

  v_result:=public.admin_basel_spot_source_preview_v3()->'source';
  if v_result->>'cadence' is distinct from 'WEEKLY' or v_result->>'enabled' is distinct from 'true'
    then raise exception 'wrong initial source settings'; end if;
  if world_knowledge_private.basel_spot_source_dispatch_v1('2026-11-17 03:15Z') is not null
    or world_knowledge_private.basel_spot_source_dispatch_v1('2026-11-16 03:15Z') is null
    then raise exception 'weekly source ran outside Monday or did not run on Monday'; end if;

  perform public.admin_basel_spot_source_settings_v1('BASEL_PLAYGROUNDS',true,'MANUAL',v_result->>'revision');
  v_prior:=public.admin_basel_spot_source_preview_v3()->'source';
  if v_prior->>'cadence' is distinct from 'MANUAL'
    or world_knowledge_private.basel_spot_source_dispatch_v1('2026-11-16 03:15Z') is not null
    or public.admin_basel_spot_source_start_v1() is null
    then raise exception 'manual schedule did not block cron or blocked manual start'; end if;

  begin
    perform public.admin_basel_spot_source_settings_v1('BASEL_PLAYGROUNDS',true,'DAILY',v_result->>'revision');
    raise exception 'allowing stale settings write';
  exception when serialization_failure then null;
  end;
  begin
    perform public.admin_basel_spot_source_settings_v1('UNREGISTERED',true,'DAILY',v_prior->>'revision');
    raise exception 'unregistered source was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.admin_basel_spot_source_settings_v1('BASEL_PLAYGROUNDS',false,'MANUAL',v_prior->>'revision');
  v_result:=public.admin_basel_spot_source_preview_v3()->'source';
  if v_result->>'enabled' is distinct from 'false'
    or world_knowledge_private.basel_spot_source_dispatch_v1('2026-11-16 03:15Z') is not null
    then raise exception 'paused source ran automatically'; end if;
  begin
    perform public.admin_basel_spot_source_start_v1();
    raise exception 'paused source accepted manual start';
  exception when object_not_in_prerequisite_state then null;
  end;

  perform public.admin_basel_spot_source_settings_v1('BASEL_PLAYGROUNDS',true,'DAILY',v_result->>'revision');
  if world_knowledge_private.basel_spot_source_dispatch_v1('2026-11-17 03:15Z') is null
    then raise exception 'daily source failed to dispatch'; end if;

  -- Sources can run together. Identical numeric IDs and review decisions
  -- remain independent between a playground feed and a sports feed.
  update world_knowledge_private.basel_spot_source_runs_v1 set status='FAILED'
    where source_key='BASEL_PLAYGROUNDS' and status='FETCHING';
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id) values ('BASEL_SPORT',-107)
    returning id into v_recheck;
  perform world_knowledge_private.basel_spot_source_apply_v1(v_recheck,
    '[{"id":910000001,"name":"Fiktives Basler Bad","kategorie":"Hallenbad","strasse":"Testweg 1","ort":"Basel","geo_point_2d":{"lat":47.551,"lon":7.59}}]');
  v_result:=public.admin_basel_place_source_preview_v1('BASEL_SPORT',910000001)#>'{rows,0}';
  if v_result#>>'{facts,category}' is distinct from 'SWIMMING_POOL'
    or v_result#>>'{facts,address}' is distinct from 'Testweg 1'
    or public.admin_basel_place_source_preview_v1('BASEL_PLAYGROUNDS',910000001)#>>'{rows,0,facts,category}' is distinct from 'PLAYGROUND'
    then raise exception 'source identity or normalized fields were mixed'; end if;
  perform public.admin_basel_place_source_review_v1('BASEL_SPORT',910000001,v_result->>'review_fingerprint',v_result->>'review_revision','DISMISSED');
  if public.admin_basel_place_source_preview_v1('BASEL_PLAYGROUNDS',910000001)#>>'{rows,0,review_state}' is distinct from 'OPEN'
    or public.admin_basel_place_source_preview_v1('BASEL_SPORT',910000001)#>>'{rows,0,review_state}' is distinct from 'DISMISSED'
    then raise exception 'review state leaked across source identities'; end if;
  begin
    perform world_knowledge_private.basel_spot_normalize_v1('BASEL_POI','[{"ort":"79576 Weil am Rhein"}]');
    raise exception 'outside-locality row accepted';
  exception when raise_exception then
    if sqlerrm <> 'basel_spot_source_outside_region' then raise; end if;
  end;

  if has_function_privilege('anon','public.admin_basel_spot_source_settings_v1(text,boolean,text,text)','execute')
    or has_function_privilege('authenticated','world_knowledge_private.basel_spot_source_dispatch_v1(timestamptz)','execute')
    or has_table_privilege('authenticated','world_knowledge_private.spot_source_settings_v1','update')
    then raise exception 'unexpected settings grants'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform public.admin_basel_spot_source_settings_v1('BASEL_PLAYGROUNDS',false,'MANUAL','4');
    raise exception 'non-admin could edit source settings';
  exception when insufficient_privilege then null;
  end;

end;
$$;

rollback;
