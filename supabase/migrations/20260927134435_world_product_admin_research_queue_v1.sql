-- Bounded Admin-only progress over the approved canonical spot catalog.
-- An export is not research completion; imported provenance is the only
-- durable proof that researched claims entered World Knowledge.
create table world_knowledge_private.research_spot_exports_v1 (
  spot_id uuid primary key references public.spots(id) on delete restrict,
  first_exported_at timestamptz not null default clock_timestamp(),
  last_exported_at timestamptz not null default clock_timestamp(),
  export_count integer not null default 1 check (export_count > 0)
);
alter table world_knowledge_private.research_spot_exports_v1 enable row level security;
revoke all on world_knowledge_private.research_spot_exports_v1 from public, anon, authenticated, service_role;

create function public.world_product_admin_record_research_export_v1(p_spot_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_spot_ids is null or pg_catalog.array_length(p_spot_ids, 1) not between 1 and 10
     or exists(select 1 from pg_catalog.unnest(p_spot_ids) as u(spot_id) where u.spot_id is null)
     or (select count(distinct u.spot_id) from pg_catalog.unnest(p_spot_ids) as u(spot_id)) <> pg_catalog.array_length(p_spot_ids, 1)
     or (select count(*) from public.spots s where s.id = any(p_spot_ids) and s.status = 'approved') <> pg_catalog.array_length(p_spot_ids, 1) then
    raise exception 'world_research_export_selection_invalid' using errcode = '22023';
  end if;
  insert into world_knowledge_private.research_spot_exports_v1 (spot_id)
  select u.spot_id from pg_catalog.unnest(p_spot_ids) as u(spot_id)
  on conflict (spot_id) do update set
    last_exported_at = clock_timestamp(),
    export_count = world_knowledge_private.research_spot_exports_v1.export_count + 1;
end;
$$;
revoke all on function public.world_product_admin_record_research_export_v1(uuid[]) from public, anon, service_role;
grant execute on function public.world_product_admin_record_research_export_v1(uuid[]) to authenticated;

create function public.world_product_admin_research_queue_v1(p_page integer default 1)
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
  if p_page is null or p_page not between 1 and 100000 then
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
    limit 10 offset (p_page - 1) * 10
  ) q;
  return pg_catalog.jsonb_build_object(
    'contractVersion', 'backyrd.world-research-queue@1.0',
    'page', p_page, 'pageSize', 10, 'total', v_total,
    'exported', v_exported, 'imported', v_imported, 'spots', v_spots
  );
end;
$$;
revoke all on function public.world_product_admin_research_queue_v1(integer) from public, anon, service_role;
grant execute on function public.world_product_admin_research_queue_v1(integer) to authenticated;

comment on function public.world_product_admin_research_queue_v1(integer) is
  'Admin-only alphabetic ten-spot research queue. Imported means provenance exists, not that every World field is complete.';
