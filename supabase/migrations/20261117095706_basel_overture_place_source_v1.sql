-- Overture's public release is GeoParquet. Accept a bounded, prepared snapshot
-- in the existing Admin staging workflow. The collector continues handling HTTP sources.
alter table world_knowledge_private.spot_source_settings_v1
  add constraint basel_overture_manual_snapshot_v1 check (source_key<>'BASEL_OVERTURE' or cadence='MANUAL');

insert into world_knowledge_private.spot_source_settings_v1(source_key,cadence)
values ('BASEL_OVERTURE','MANUAL');

create sequence world_knowledge_private.basel_overture_source_row_v1 as integer;

alter table world_knowledge_private.basel_spot_source_runs_v1
  add column release_version text,
  add column snapshot_hash text;

create unique index basel_overture_source_release_v1
  on world_knowledge_private.basel_spot_source_runs_v1(release_version) where source_key='BASEL_OVERTURE';

create unique index basel_overture_source_identity_v1
  on world_knowledge_private.basel_spot_source_rows_v1((facts->>'external_id')) where source_key='BASEL_OVERTURE';

create function public.admin_basel_overture_import_v1(p_release text,p_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_key constant text := 'BASEL_OVERTURE';
  v_count integer;
  v_run bigint;
  v_hash text;
  v_previous world_knowledge_private.basel_spot_source_runs_v1;
begin
  if auth.uid() is null or (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_release is null or p_release !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}\.[0-9]{1,2}$'
     or jsonb_typeof(p_rows) is distinct from 'array' or octet_length(p_rows::text)>1800000 then
    raise exception 'overture_snapshot_invalid' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_rows);
  if v_count not between 1 and 2500
    or (select count(distinct item->>'id') from jsonb_array_elements(p_rows) item)<>v_count
    or exists (
      select 1 from jsonb_array_elements(p_rows) item
      where coalesce(item->>'id','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
        or jsonb_typeof(item->'name') is distinct from 'string'
        or length(trim(item->>'name')) not between 1 and 160
        or coalesce(item->>'category','') not in ('RESTAURANT','CAFE','BAR','NIGHTCLUB')
        or case when jsonb_typeof(item->'lat')='number' and jsonb_typeof(item->'lng')='number'
          and jsonb_typeof(item->'confidence')='number' then
            (item->>'lat')::numeric not between 47.519 and 47.591
            or (item->>'lng')::numeric not between 7.554 and 7.635
            or (item->>'confidence')::numeric not between 0.6 and 1
          else true end
    ) then
    raise exception 'overture_snapshot_invalid_rows' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(14078531,1);
  if not exists(select 1 from world_knowledge_private.spot_source_settings_v1 where source_key=v_key and enabled) then
    raise exception 'spot_source_disabled' using errcode='55000';
  end if;
  -- Canonical output is sorted by GERS ID. Ordering differences on replay do not change the digest.
  select encode(sha256(convert_to(jsonb_agg(item order by item->>'id')::text,'UTF8')),'hex')
    into v_hash from jsonb_array_elements(p_rows) item;
  select * into v_previous from world_knowledge_private.basel_spot_source_runs_v1
    where source_key=v_key and status='COMPLETE' order by id desc limit 1;
  if found then
    if p_release=v_previous.release_version and v_hash=v_previous.snapshot_hash then return v_previous.source_count; end if;
    if (left(p_release,10),(split_part(p_release,'.',2))::integer)
      <= (left(v_previous.release_version,10),(split_part(v_previous.release_version,'.',2))::integer) then
      raise exception 'overture_snapshot_release_not_newer' using errcode='22023';
    end if;
    -- An unexpectedly short replacement would mark most existing places missing.
    if v_count*2 < v_previous.source_count then
      raise exception 'overture_snapshot_incomplete' using errcode='22023';
    end if;
  end if;

  insert into world_knowledge_private.basel_spot_source_runs_v1(
    source_key,request_id,status,finished_at,source_count,release_version,snapshot_hash)
    values (v_key,-(1000000000000 + nextval('world_knowledge_private.basel_overture_source_row_v1')),
      'COMPLETE',now(),v_count,p_release,v_hash)
    returning id into v_run;

  insert into world_knowledge_private.basel_spot_source_rows_v1 as existing
      (source_key,source_id,facts,last_seen_run_id,changed_at)
    select v_key,coalesce(prior.source_id,nextval('world_knowledge_private.basel_overture_source_row_v1')::integer),
      jsonb_strip_nulls(jsonb_build_object(
        'external_id',item->>'id','name',trim(item->>'name'),'lat',item->'lat','lng',item->'lng',
        'category',item->>'category','city','Basel','equipment','[]'::jsonb,
        'attribution',coalesce((
          select jsonb_agg(label order by label)
          from (select distinct left(f.value->>'dataset',100)||' ('||(f.value->>'license')||')' as label
            from jsonb_array_elements(case when jsonb_typeof(item->'sources')='array' then item->'sources' else '[]'::jsonb end) f
            where f.value->>'license' in ('CDLA-Permissive-2.0','Apache-2.0','CC0-1.0')
              and nullif(trim(f.value->>'dataset'),'') is not null
            order by label limit 12) credits
        ),'[]'::jsonb),
        'address',nullif(left(trim(item->>'address'),200),''),
        'phone',case when item->>'phone' ~ '^[+0-9][0-9+ ()./-]{5,40}$' then item->>'phone' end,
        'website',case when item->>'website' ~ '^https?://[A-Za-z0-9]' then left(item->>'website',1000) end
      )),v_run,now()
    from jsonb_array_elements(p_rows) item
    left join world_knowledge_private.basel_spot_source_rows_v1 prior
      on prior.source_key='BASEL_OVERTURE' and prior.facts->>'external_id'=item->>'id'
    on conflict (source_key,source_id) do update set
      previous_facts=case when existing.facts<>excluded.facts then existing.facts else existing.previous_facts end,
      changed_at=case when existing.facts<>excluded.facts then excluded.changed_at else existing.changed_at end,
      facts=excluded.facts,last_seen_run_id=excluded.last_seen_run_id;
  return v_count;
end;
$$;
revoke all on function public.admin_basel_overture_import_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_basel_overture_import_v1(text,jsonb) to authenticated;

create function world_knowledge_private.basel_spot_source_raw_preview_v2(p_key text,p_source_id integer,p_after integer,p_limit integer)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_latest bigint;
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select max(id) into v_latest from world_knowledge_private.basel_spot_source_runs_v1 where status='COMPLETE' and source_key=p_key;

  return (
  with catalog as materialized (
    select s.id,s.name,s.address,s.status,s.lat,s.lng,
      world_knowledge_private.basel_spot_source_name_v1(s.name) as normalized_name
    from public.spots s
    where coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE')
      and s.lat between 47.47 and 47.63 and s.lng between 7.49 and 7.73
  )
  select jsonb_build_object(
    'category_id',(select case when count(*)=1 then (array_agg(id))[1] end from public.categories where lower(trim(name))='spielplatz'),
    'runs',coalesce((select jsonb_agg(to_jsonb(recent) order by recent.id desc)
      from (select id,status,started_at,finished_at,source_count,outcome,release_version
        from world_knowledge_private.basel_spot_source_runs_v1 where source_key=p_key order by id desc limit 5) recent),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(preview) order by preview.state,preview.facts->>'name',preview.source_id)
      from (
        select r.source_id,r.facts,r.previous_facts,r.changed_at,seen.finished_at as checked_at,
          case when r.last_seen_run_id<>v_latest then 'MISSING'
            when match.identical=1 and match.possible=1 then 'MATCHED'
            when match.possible>0 then 'REVIEW'
            else 'NEW' end as state,
          match.spots,
          (select case when count(*)=1 then (array_agg(c.id))[1] end from public.categories c
            where lower(trim(c.name))=case r.facts->>'category'
              when 'PLAYGROUND' then 'spielplatz' when 'MUSEUM' then 'museum'
              when 'RESTAURANT' then 'restaurant' when 'CAFE' then 'café'
              when 'BAR' then 'bar' when 'NIGHTCLUB' then 'nachtleben'
              when 'VIEWPOINT' then 'aussichtspunkt' when 'HOTEL' then 'hotel'
              when 'HOSTEL' then 'hostel' when 'ICE_RINK' then 'eisbahn'
              when 'OUTDOOR_POOL' then 'freibad' when 'SWIMMING_POOL' then 'schwimmbad'
              when 'SPORTS_CENTRE' then 'sportzentrum' when 'SPORTS_COURT' then 'sportplatz'
              when 'EVENT_VENUE' then 'veranstaltungsort' when 'LANDMARK' then 'sehenswürdigkeit'
              else null end) as category_id
        from (
          select * from world_knowledge_private.basel_spot_source_rows_v1
          where source_key=p_key and (p_source_id is null or source_id=p_source_id)
            and (p_after is null or source_id>p_after)
          order by source_id limit p_limit
        ) r
        join world_knowledge_private.basel_spot_source_runs_v1 seen on seen.id=r.last_seen_run_id
        cross join lateral (
          select count(*) filter (where nearby.same_name and nearby.distance_m<=150) as identical,
            count(*) as possible,
            coalesce(jsonb_agg(jsonb_build_object('id',nearby.id,'name',nearby.name,'address',nearby.address,
              'status',nearby.status,'distance_m',round(nearby.distance_m)) order by nearby.distance_m,nearby.id),'[]'::jsonb) as spots
          from (
            select s.id,s.name,s.address,s.status,
              s.normalized_name=world_knowledge_private.basel_spot_source_name_v1(r.facts->>'name') as same_name,
              111320*sqrt(power(s.lat-(r.facts->>'lat')::double precision,2)+
                power((s.lng-(r.facts->>'lng')::double precision)*cos(radians((r.facts->>'lat')::double precision)),2)) as distance_m
            from catalog s
            where s.normalized_name=world_knowledge_private.basel_spot_source_name_v1(r.facts->>'name')
              or (s.lat between (r.facts->>'lat')::double precision-0.00041 and (r.facts->>'lat')::double precision+0.00041
                and s.lng between (r.facts->>'lng')::double precision-0.00061 and (r.facts->>'lng')::double precision+0.00061)
          ) nearby
          where nearby.distance_m<=45 or nearby.same_name
        ) match
      ) preview),'[]'::jsonb)
  ));
end;
$$;

revoke all on function world_knowledge_private.basel_spot_source_raw_preview_v2(text,integer,integer,integer)
  from public,anon,authenticated,service_role;

create or replace function world_knowledge_private.basel_spot_source_raw_preview_v1(p_key text,p_source_id integer)
returns jsonb language sql stable set search_path='' as $$
  select world_knowledge_private.basel_spot_source_raw_preview_v2(
    p_key,p_source_id,null,case when p_key='BASEL_OVERTURE' and p_source_id is null then 50 end)
$$;

create function public.admin_basel_overture_preview_v1(p_after integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb; v_next integer;
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_after is null or p_after<0 then raise exception 'overture_page_invalid' using errcode='22023'; end if;

  v_preview:=world_knowledge_private.basel_spot_source_raw_preview_v2('BASEL_OVERTURE',null,p_after,50);
  select max((row->>'source_id')::integer) into v_next from jsonb_array_elements(v_preview->'rows') row;
  if not exists(select 1 from world_knowledge_private.basel_spot_source_rows_v1
    where source_key='BASEL_OVERTURE' and source_id>v_next) then v_next:=null; end if;

  return jsonb_set(v_preview,'{rows}',coalesce((
    select jsonb_agg(item order by item->>'state',item#>>'{facts,name}',(item->>'source_id')::integer)
    from world_knowledge_private.basel_spot_review_rows_v2('BASEL_OVERTURE',v_preview->'rows') item
  ),'[]'::jsonb)) || jsonb_build_object('next_after',v_next,'source',(
    select jsonb_build_object('key',source_key,'enabled',enabled,'cadence',cadence,'revision',revision::text,'schedule_time_utc','03:15')
    from world_knowledge_private.spot_source_settings_v1 where source_key='BASEL_OVERTURE'
  ));
end;
$$;
revoke all on function public.admin_basel_overture_preview_v1(integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_basel_overture_preview_v1(integer) to authenticated;
