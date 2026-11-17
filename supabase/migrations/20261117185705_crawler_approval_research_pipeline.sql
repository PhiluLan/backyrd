alter table world_knowledge_private.basel_spot_source_imports_v1
  add column research_job_id uuid references public.world_research_automation_jobs_v1(id) on delete set null;

-- Geography alone does not identify a business in a shared building.
-- An explicit review can resolve proximity matches, never a name match.
create function world_knowledge_private.backyrd_crawler_can_confirm_distinct_v1(p_row jsonb)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_row->>'state'='REVIEW'
    and not exists (
      select 1 from jsonb_array_elements(p_row->'spots') candidate
      cross join lateral (select
        world_knowledge_private.basel_spot_source_name_v1(candidate->>'name') as existing,
        world_knowledge_private.basel_spot_source_name_v1(p_row#>>'{facts,name}') as incoming
      ) names
      where existing=incoming or regexp_replace(existing, ' (bar|cafe|café|restaurant|bistro|club)$','')
        = regexp_replace(incoming, ' (bar|cafe|café|restaurant|bistro|club)$','')
    ), false)
$$;

create function world_knowledge_private.basel_place_source_create_spot_v2(
  p_key text, p_source_id integer, p_fingerprint text, p_revision text,
  p_category_id uuid, p_confirm_distinct boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_facts jsonb;
  v_spot_id uuid;
  v_category_id uuid;
begin
  if v_actor is null or (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;

  -- Import calls across sources must see any preceding import before matching.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('basel-place-source-create-spot',0));
  perform 1 from world_knowledge_private.basel_spot_source_rows_v1
    where source_key=p_key and source_id=p_source_id for update;
  if not found then raise exception 'spot_import_review_missing' using errcode='P0002'; end if;

  -- A retry after a committed request returns the same spot, even if the source has changed.
  select spot_id into v_spot_id from world_knowledge_private.basel_spot_source_imports_v1
    where source_key=p_key and source_id=p_source_id;
  if found then return v_spot_id; end if;

  v_row := public.admin_basel_place_source_preview_v1(p_key,p_source_id)#>'{rows,0}';
  if v_row->>'state' is distinct from 'NEW'
    and not (p_key='BASEL_WEB' and p_confirm_distinct is true
      and world_knowledge_private.backyrd_crawler_can_confirm_distinct_v1(v_row) is true) then
    raise exception 'spot_import_no_longer_new' using errcode='40001';
  end if;
  if v_row->>'review_fingerprint' is distinct from p_fingerprint
    or v_row->>'review_revision' is distinct from p_revision
    or coalesce(v_row->>'review_state','') not in ('OPEN','REVIEWED') then
    raise exception 'spot_import_review_stale' using errcode='40001';
  end if;

  v_facts := v_row->'facts';
  v_category_id := coalesce((v_row->>'category_id')::uuid,p_category_id);
  if not exists(select 1 from public.categories where id=v_category_id) then
    raise exception 'spot_import_category_required' using errcode='22023';
  end if;
  if nullif(trim(v_facts->>'name'),'') is null
    or (v_facts->>'lat')::double precision between 47.47 and 47.63 is not true
    or (v_facts->>'lng')::double precision between 7.49 and 7.73 is not true then
    raise exception 'spot_import_basics_invalid' using errcode='22023';
  end if;

  insert into public.spots (
    name,address,city,country,lat,lng,category_id,phone,website,created_by,status,google_photo_enabled
  ) values (
    v_facts->>'name',v_facts->>'address',v_facts->>'city','Switzerland',
    (v_facts->>'lat')::double precision,(v_facts->>'lng')::double precision,
    v_category_id,v_facts->>'phone',v_facts->>'website',v_actor,'approved',false
  ) returning id into v_spot_id;

  insert into world_knowledge_private.basel_spot_source_imports_v1 (
    source_key,source_id,spot_id,source_facts,source_checked_at,imported_by
  ) values (p_key,p_source_id,v_spot_id,v_facts,(v_row->>'checked_at')::timestamptz,v_actor);
  return v_spot_id;
end;
$$;
create or replace function public.admin_basel_place_source_create_spot_v1(
  p_key text, p_source_id integer, p_fingerprint text, p_revision text, p_category_id uuid default null
) returns uuid language sql security definer set search_path='' as $$
  select world_knowledge_private.basel_place_source_create_spot_v2(
    p_key,p_source_id,p_fingerprint,p_revision,p_category_id,false)
$$;

create function public.admin_backyrd_crawler_approve_spot_v1(
  p_source_id integer,p_fingerprint text,p_revision text,p_category_id uuid,p_confirm_distinct boolean
) returns uuid language sql security definer set search_path='' as $$
  select world_knowledge_private.basel_place_source_create_spot_v2(
    'BASEL_WEB',p_source_id,p_fingerprint,p_revision,p_category_id,p_confirm_distinct)
$$;

create function public.admin_backyrd_crawler_import_v1(p_source_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.admin_is_admin_v1() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return (
    select jsonb_build_object('spotId', imported.spot_id, 'jobId', job.id, 'status', job.status)
    from world_knowledge_private.basel_spot_source_imports_v1 imported
    join public.spots spot on spot.id=imported.spot_id and spot.status='approved'
    left join public.world_research_automation_jobs_v1 job on job.id=imported.research_job_id
    where imported.source_key='BASEL_WEB' and imported.source_id=p_source_id
  );
end
$$;

create function public.backyrd_crawler_enqueue_research_v1(
  p_source_id integer,p_actor_id uuid,p_spot_id uuid,p_document jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_spot uuid; v_job uuid; v_status text;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  select imported.spot_id,imported.research_job_id into v_spot,v_job
  from world_knowledge_private.basel_spot_source_imports_v1 imported
  join public.spots spot on spot.id=imported.spot_id and spot.status='approved'
  where imported.source_key='BASEL_WEB' and imported.source_id=p_source_id
  for update of imported;
  if not found or v_spot is distinct from p_spot_id then
    raise exception 'crawler_import_unavailable' using errcode='22023';
  end if;
  select job.status into v_status from public.world_research_automation_jobs_v1 job where job.id=v_job;
  if v_status in ('QUEUED','RUNNING','READY_FOR_REVIEW') then return v_job; end if;
  v_job:=(public.world_research_automation_enqueue_v1(p_actor_id,v_spot,p_document)->>'jobId')::uuid;
  if v_job is null then raise exception 'crawler_research_enqueue_failed'; end if;
  update world_knowledge_private.basel_spot_source_imports_v1 set research_job_id=v_job
    where source_key='BASEL_WEB' and source_id=p_source_id;
  return v_job;
end
$$;

create or replace function public.admin_backyrd_spot_crawler_preview_v1(p_after integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb; v_next integer;
begin
  if auth.uid() is null or public.admin_is_admin_v1() is not true then raise exception 'admin_required' using errcode='42501'; end if;
  v_preview:=world_knowledge_private.basel_spot_source_raw_preview_v2('BASEL_WEB',null,greatest(p_after,0),50);
  v_preview:=jsonb_set(v_preview,'{runs}', coalesce((
    select jsonb_agg(case when item->>'status'='FETCHING'
        and (item->>'started_at')::timestamptz < now()-interval '5 minutes'
      then item || '{"status":"FAILED","outcome":"RUN_TIMEOUT"}'::jsonb else item end order by ordinal)
    from jsonb_array_elements(v_preview->'runs') with ordinality as runs(item,ordinal)
  ),'[]'::jsonb));
  select max((item->>'source_id')::integer) into v_next from jsonb_array_elements(v_preview->'rows') item;
  if not exists(select 1 from world_knowledge_private.basel_spot_source_rows_v1
    where source_key='BASEL_WEB' and source_id>v_next) then v_next:=null; end if;
  return jsonb_set(v_preview,'{rows}',coalesce((
    select jsonb_agg(item || jsonb_build_object(
      'can_confirm_distinct', world_knowledge_private.backyrd_crawler_can_confirm_distinct_v1(item),
      'research_status', job.status
    ) order by (item->>'source_id')::integer)
    from world_knowledge_private.basel_spot_review_rows_v2('BASEL_WEB',v_preview->'rows') item
    left join world_knowledge_private.basel_spot_source_imports_v1 imported
      on imported.source_key='BASEL_WEB' and imported.source_id=(item->>'source_id')::integer
    left join public.world_research_automation_jobs_v1 job on job.id=imported.research_job_id
  ),'[]'::jsonb)) || jsonb_build_object('next_after',v_next);
end
$$;

revoke all on function world_knowledge_private.backyrd_crawler_can_confirm_distinct_v1(jsonb),
  world_knowledge_private.basel_place_source_create_spot_v2(text,integer,text,text,uuid,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.admin_backyrd_crawler_approve_spot_v1(integer,text,text,uuid,boolean),
  public.admin_backyrd_crawler_import_v1(integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_backyrd_crawler_approve_spot_v1(integer,text,text,uuid,boolean),
  public.admin_backyrd_crawler_import_v1(integer) to authenticated;
revoke all on function public.backyrd_crawler_enqueue_research_v1(integer,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.backyrd_crawler_enqueue_research_v1(integer,uuid,uuid,jsonb) to service_role;
