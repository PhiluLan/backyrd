create or replace function public.world_research_automation_enqueue_v1(
  p_actor_id uuid, p_spot_id uuid, p_export_document jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_existing public.world_research_automation_jobs_v1%rowtype;
declare v_new public.world_research_automation_jobs_v1%rowtype;
begin
  if p_actor_id is null or p_spot_id is null
    or jsonb_typeof(p_export_document) <> 'object'
    or p_export_document->>'contractVersion' <> 'backyrd.world-research-batch@1.1'
    or coalesce(jsonb_typeof(p_export_document->'batch'->'spots'), 'null') <> 'array'
    or jsonb_array_length(p_export_document->'batch'->'spots') <> 1
    or p_export_document#>>'{batch,spots,0,spotId}' <> p_spot_id::text then
    raise exception 'world_research_automation_export_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('world-research:' || p_actor_id::text));
  select * into v_existing from public.world_research_automation_jobs_v1
    where spot_id = p_spot_id and status in ('QUEUED', 'RUNNING')
    order by created_at desc limit 1;
  if found then
    -- A repeated button press creates a fresh export UUID. Reuse the active
    -- actor/spot job rather than interpreting that new hash as a new request.
    if v_existing.actor_id = p_actor_id then
      return jsonb_build_object('jobId', v_existing.id, 'status', v_existing.status, 'reused', true);
    end if;
    raise exception 'world_research_automation_spot_busy' using errcode = '23505';
  end if;
  if (select count(*) from public.world_research_automation_jobs_v1
      where actor_id = p_actor_id and created_at >= now() - interval '1 day'
        and export_document->>'contractVersion'='backyrd.world-research-batch@1.1'
        and export_document->>'kind' is null) >= 50 then
    raise exception 'world_research_automation_daily_limit' using errcode = '22023';
  end if;
  insert into public.world_research_automation_jobs_v1(spot_id, spot_name, actor_id, export_document)
    values (p_spot_id, p_export_document#>>'{batch,spots,0,name}', p_actor_id, p_export_document) returning * into v_new;
  return jsonb_build_object('jobId', v_new.id, 'status', v_new.status, 'reused', false);
end $$;

-- Enqueue the full selection atomically and retain the single-spot worker contract.
create function public.world_research_automation_enqueue_batch_v1(p_actor_id uuid,p_documents jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_document jsonb;
  v_spot uuid;
  v_jobs jsonb := '[]'::jsonb;
begin
  if p_actor_id is null or jsonb_typeof(p_documents) is distinct from 'array'
    or octet_length(p_documents::text)>8000000 then
    raise exception 'world_research_automation_export_invalid' using errcode='22023';
  end if;
  if jsonb_array_length(p_documents) not between 1 and 50
    or (select count(distinct doc#>>'{batch,spots,0,spotId}') from jsonb_array_elements(p_documents) doc)<>jsonb_array_length(p_documents)
    or exists (select 1 from jsonb_array_elements(p_documents) doc
      where jsonb_typeof(doc) is distinct from 'object'
        or doc->>'contractVersion' is distinct from 'backyrd.world-research-batch@1.1'
        or doc->>'kind' is not null
        or case when jsonb_typeof(doc#>'{batch,spots}')='array' then jsonb_array_length(doc#>'{batch,spots}')<>1 else true end
    ) then
    raise exception 'world_research_automation_export_invalid' using errcode='22023';
  end if;
  for v_document in select doc from jsonb_array_elements(p_documents) doc order by doc#>>'{batch,spots,0,spotId}'
  loop
    v_spot := (v_document#>>'{batch,spots,0,spotId}')::uuid;
    v_jobs := v_jobs || jsonb_build_array(jsonb_build_object('spotId',v_spot)
      || public.world_research_automation_enqueue_v1(p_actor_id,v_spot,v_document));
  end loop;
  return v_jobs;
end;
$$;
revoke all on function public.world_research_automation_enqueue_batch_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.world_research_automation_enqueue_batch_v1(uuid,jsonb) to service_role;

create function public.world_product_admin_research_queue_v2(p_page integer,p_page_size integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_total integer;
  v_imported integer;
  v_exported integer;
  v_spots jsonb;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not in (10,20,30,40,50) then
    raise exception 'world_research_page_invalid' using errcode = '22023';
  end if;
  select count(*)::integer,
    count(*) filter (where exists (
      select 1 from world_knowledge_private.research_claim_evidence_v1 e where e.spot_id = s.id
    ))::integer,
    count(*) filter (where exists (
      select 1 from world_knowledge_private.research_spot_exports_v1 x where x.spot_id = s.id
    ))::integer
  into v_total, v_imported, v_exported
  from public.spots s where s.status = 'approved';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'spotId', q.id, 'name', q.name, 'city', q.city,
      'exportedAt', q.last_exported_at, 'importedAt', q.imported_at
    ) order by q.sort_name, q.id), '[]'::jsonb)
  into v_spots
  from (
    select s.id, s.name, s.city, pg_catalog.lower(s.name) as sort_name,
      x.last_exported_at,
      (select max(e.created_at) from world_knowledge_private.research_claim_evidence_v1 e where e.spot_id = s.id) as imported_at
    from public.spots s
    left join world_knowledge_private.research_spot_exports_v1 x on x.spot_id = s.id
    where s.status = 'approved'
    order by pg_catalog.lower(s.name), s.id
    limit p_page_size offset (p_page - 1) * p_page_size
  ) q;
  return pg_catalog.jsonb_build_object(
    'contractVersion', 'backyrd.world-research-queue@1.0',
    'page', p_page, 'pageSize', p_page_size, 'total', v_total,
    'exported', v_exported, 'imported', v_imported, 'spots', v_spots
  );
end;
$$;
revoke all on function public.world_product_admin_research_queue_v2(integer,integer) from public, anon, service_role;
grant execute on function public.world_product_admin_research_queue_v2(integer,integer) to authenticated;

create or replace function public.world_product_admin_research_queue_v1(p_page integer default 1)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.world_product_admin_research_queue_v2(p_page,10)
$$;
