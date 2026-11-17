create table world_knowledge_private.basel_spot_source_imports_v1 (
  source_key text not null,
  source_id integer not null,
  spot_id uuid not null unique references public.spots(id) on delete cascade,
  source_facts jsonb not null,
  source_checked_at timestamptz not null,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  primary key (source_key,source_id),
  foreign key (source_key,source_id)
    references world_knowledge_private.basel_spot_source_rows_v1(source_key,source_id)
);
alter table world_knowledge_private.basel_spot_source_imports_v1 enable row level security;
revoke all on world_knowledge_private.basel_spot_source_imports_v1
  from public,anon,authenticated,service_role;

create or replace function world_knowledge_private.basel_spot_review_rows_v2(p_key text,p_rows jsonb)
returns setof jsonb language sql stable set search_path='' as $$
  select item || jsonb_build_object(
    'imported_spot_id', imported.spot_id,
    'review_fingerprint', fingerprint.value,
    'review_revision', coalesce(review.revision,0)::text,
    'review_state', case
      when imported.source_id is not null then 'IMPORTED'
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
  left join world_knowledge_private.basel_spot_source_reviews_v1 review
    on review.source_key=p_key and review.source_id=(item->>'source_id')::integer
  left join world_knowledge_private.basel_spot_source_imports_v1 imported
    on imported.source_key=p_key and imported.source_id=(item->>'source_id')::integer;
$$;

create function public.admin_basel_place_source_create_spot_v1(
  p_key text, p_source_id integer, p_fingerprint text, p_revision text,
  p_category_id uuid default null
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
  if v_row->>'state' is distinct from 'NEW' then
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
revoke all on function public.admin_basel_place_source_create_spot_v1(text,integer,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_basel_place_source_create_spot_v1(text,integer,text,text,uuid) to authenticated;

-- Public details show the credit for copied source fields. Review history,
-- the full source record and admin identities stay in the private table.
create function public.spot_place_source_credit_v1(p_spot_id uuid)
returns table(credit text, source_url text, license_url text)
language sql stable security definer set search_path='' as $$
  select
    case i.source_key
      when 'BASEL_PLAYGROUNDS' then 'Stadtgärtnerei Basel-Stadt via Open Data Basel-Stadt'
      when 'BASEL_OVERTURE' then concat_ws(' · ', 'Overture Maps Foundation',
        (select string_agg(item, ', ' order by item)
          from jsonb_array_elements_text(i.source_facts->'attribution') item))
      else 'Geodaten Kanton Basel-Stadt via Open Data Basel-Stadt'
    end,
    case i.source_key
      when 'BASEL_PLAYGROUNDS' then 'https://data.bs.ch/explore/dataset/100462/'
      when 'BASEL_POI' then 'https://data.bs.ch/explore/dataset/100015/'
      when 'BASEL_SPORT' then 'https://data.bs.ch/explore/dataset/100151/'
      when 'BASEL_OVERTURE' then 'https://docs.overturemaps.org/guides/places/'
    end,
    case when i.source_key='BASEL_OVERTURE' then 'https://docs.overturemaps.org/attribution/'
      else 'https://creativecommons.org/licenses/by/4.0/' end
  from world_knowledge_private.basel_spot_source_imports_v1 i
  join public.spots s on s.id=i.spot_id
  where i.spot_id=p_spot_id and s.status='approved'
$$;
revoke all on function public.spot_place_source_credit_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.spot_place_source_credit_v1(uuid) to anon,authenticated;
