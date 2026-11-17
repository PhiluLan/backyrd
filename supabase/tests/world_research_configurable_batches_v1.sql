\set ON_ERROR_STOP on
begin;

do $$
declare
  v_admin uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid();
  v_documents jsonb;
  v_first_fifty jsonb;
  v_jobs jsonb;
  v_page jsonb;
begin
  insert into auth.users(id) values(v_admin);
  insert into public.profiles(id,is_admin) values(v_admin,true)
    on conflict(id) do update set is_admin=true;
  with fixtures as (
    insert into public.spots(name,status,lat,lng)
    select 'Batch Fixture ' || lpad(n::text,2,'0'),'approved',47.55,7.59 from generate_series(1,51) n
    returning id,name
  )
  select jsonb_agg(jsonb_build_object(
    'contractVersion','backyrd.world-research-batch@1.1',
    'batch',jsonb_build_object('spots',jsonb_build_array(jsonb_build_object('spotId',id,'name',name)))
  ) order by name) into v_documents from fixtures;
  select jsonb_agg(doc order by idx) into v_first_fifty
    from jsonb_array_elements(v_documents) with ordinality s(doc,idx) where idx<=50;

-- backyrd:authorization-negative
  if has_function_privilege('authenticated','public.world_research_automation_enqueue_batch_v1(uuid,jsonb)','execute')
    or has_function_privilege('anon','public.world_product_admin_research_queue_v2(integer,integer)','execute')
    then raise exception 'research roles leaked'; end if;
  begin
    perform public.world_product_admin_research_queue_v2(1,50);
    raise exception 'non-admin could list the research queue';
  exception when insufficient_privilege then null;
  end;

-- backyrd:authorization-positive
  if not has_function_privilege('service_role','public.world_research_automation_enqueue_batch_v1(uuid,jsonb)','execute')
    then raise exception 'service role lost batch access'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  v_page:=public.world_product_admin_research_queue_v2(1,50);
  if v_page->>'pageSize' is distinct from '50' or jsonb_array_length(v_page->'spots')<>50
    then raise exception 'requested page size not respected'; end if;

  v_jobs:=public.world_research_automation_enqueue_batch_v1(v_admin,v_first_fifty);
  if jsonb_array_length(v_jobs)<>50 then raise exception 'did not enqueue all 50 spots'; end if;
  v_jobs:=public.world_research_automation_enqueue_batch_v1(v_admin,v_first_fifty);
  if exists(select 1 from jsonb_array_elements(v_jobs) j where j->>'reused' is distinct from 'true')
    then raise exception 'replay duplicated active jobs'; end if;

  begin
    perform public.world_research_automation_enqueue_batch_v1(v_admin,jsonb_build_array(v_documents->50));
    raise exception 'actor could surpass 50 daily jobs';
  exception when invalid_parameter_value then
    if sqlerrm<>'world_research_automation_daily_limit' then raise; end if;
  end;
  begin
    perform public.world_research_automation_enqueue_batch_v1(v_other,jsonb_build_array(v_documents->50,v_documents->0));
    raise exception 'actor could start another actor''s active spot';
  exception when unique_violation then null;
  end;
  if exists(select 1 from public.world_research_automation_jobs_v1 where actor_id=v_other)
    then raise exception 'failed batch partially enqueued'; end if;
end;
$$;
rollback;
