create table world_knowledge_private.basel_spot_source_reviews_v1 (
  source_id integer primary key references world_knowledge_private.basel_spot_source_rows_v1(source_id),
  disposition text not null check (disposition in ('REVIEWED','DISMISSED','REOPENED')),
  fingerprint text not null,
  revision bigint not null default 1,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now()
);
alter table world_knowledge_private.basel_spot_source_reviews_v1 enable row level security;
revoke all on world_knowledge_private.basel_spot_source_reviews_v1 from public, anon, authenticated;

-- The revision of the source details and proposed matches excludes the polling
-- timestamp and cosmetic distance rounding. Replayed imports stay reviewed.
create function world_knowledge_private.basel_spot_review_rows_v1(p_rows jsonb)
returns setof jsonb language sql stable set search_path='' as $$
  select item || jsonb_build_object(
    'review_fingerprint', fingerprint.value,
    'review_revision', coalesce(review.revision,0)::text,
    'review_state', case
      when review.fingerprint=fingerprint.value and review.disposition in ('REVIEWED','DISMISSED') then review.disposition
      when review.source_id is not null then 'OPEN'
      when item->>'state'='MATCHED' and jsonb_typeof(item->'previous_facts')='null' then 'EXISTING'
      else 'OPEN'
    end
  )
  from jsonb_array_elements(p_rows) item
  cross join lateral (
    select encode(sha256(convert_to(jsonb_build_object(
      'facts',item->'facts','state',item->'state','changed_at',item->'changed_at',
      'spots',coalesce((select jsonb_agg(candidate - 'distance_m' order by candidate->>'id')
        from jsonb_array_elements(item->'spots') candidate),'[]'::jsonb)
    )::text,'UTF8')),'hex') as value
  ) fingerprint
  left join world_knowledge_private.basel_spot_source_reviews_v1 review on review.source_id=(item->>'source_id')::integer;
$$;

create function public.admin_basel_spot_source_preview_v2(p_source_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb;
begin
  -- The existing preview checks the session's admin role and owns matching.
  v_preview := public.admin_basel_spot_source_preview_v1(p_source_id);
  return jsonb_set(v_preview,'{rows}',coalesce((
    select jsonb_agg(item order by item->>'state',item#>>'{facts,name}',(item->>'source_id')::integer)
    from world_knowledge_private.basel_spot_review_rows_v1(v_preview->'rows') item
  ),'[]'::jsonb));
end;
$$;

create function public.admin_basel_spot_source_set_review_v1(
  p_source_id integer, p_fingerprint text, p_revision text, p_disposition text
) returns void language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb;
begin
  if v_actor is null or (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_source_id is null or p_disposition is null or p_disposition not in ('REVIEWED','DISMISSED','REOPENED') then
    raise exception 'invalid_spot_import_review' using errcode='22023';
  end if;

  -- Serialize with both a concurrent review and an updated source snapshot.
  perform 1 from world_knowledge_private.basel_spot_source_rows_v1 where source_id=p_source_id for update;
  if not found then raise exception 'spot_import_review_missing' using errcode='P0002'; end if;
  v_row := public.admin_basel_spot_source_preview_v2(p_source_id)#>'{rows,0}';

  if v_row->>'review_fingerprint' is distinct from p_fingerprint
    or v_row->>'review_revision' is distinct from p_revision then
    raise exception 'spot_import_review_stale' using errcode='40001';
  end if;
  if (p_disposition='REOPENED' and v_row->>'review_state'='OPEN') or v_row->>'review_state'=p_disposition then
    return;
  end if;

  insert into world_knowledge_private.basel_spot_source_reviews_v1 as prior(
    source_id,disposition,fingerprint,reviewed_by
  ) values (p_source_id,p_disposition,p_fingerprint,v_actor)
  on conflict (source_id) do update set
    disposition=excluded.disposition, fingerprint=excluded.fingerprint,
    revision=prior.revision+1, reviewed_by=excluded.reviewed_by, reviewed_at=now();
end;
$$;

revoke all on function world_knowledge_private.basel_spot_review_rows_v1(jsonb) from public, anon, authenticated;
revoke all on function public.admin_basel_spot_source_preview_v2(integer),
  public.admin_basel_spot_source_set_review_v1(integer,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_basel_spot_source_preview_v2(integer),
  public.admin_basel_spot_source_set_review_v1(integer,text,text,text) to authenticated;
