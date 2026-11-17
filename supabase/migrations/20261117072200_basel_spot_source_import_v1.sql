-- Read-only discovery from the official Basel playground dataset. Only the
-- existing editor can turn a suggestion into a catalog spot.
create table world_knowledge_private.basel_spot_source_runs_v1 (
  id bigint generated always as identity primary key,
  request_id bigint unique not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'FETCHING' check (status in ('FETCHING','COMPLETE','FAILED')),
  source_count integer,
  outcome text
);
create unique index basel_spot_source_single_fetch_v1
  on world_knowledge_private.basel_spot_source_runs_v1 (status) where status='FETCHING';

create table world_knowledge_private.basel_spot_source_rows_v1 (
  source_id integer primary key check (source_id > 0),
  facts jsonb not null,
  previous_facts jsonb,
  last_seen_run_id bigint not null references world_knowledge_private.basel_spot_source_runs_v1(id),
  changed_at timestamptz not null
);

alter table world_knowledge_private.basel_spot_source_runs_v1 enable row level security;
alter table world_knowledge_private.basel_spot_source_rows_v1 enable row level security;
revoke all on world_knowledge_private.basel_spot_source_runs_v1,
  world_knowledge_private.basel_spot_source_rows_v1 from public, anon, authenticated;

create function world_knowledge_private.basel_spot_source_start_v1()
returns bigint language plpgsql set search_path='' as $$
declare v_run bigint; v_request bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(14078531, 1);
  select id into v_run from world_knowledge_private.basel_spot_source_runs_v1
    where status='FETCHING' or started_at > now() - interval '5 minutes'
    order by id desc limit 1;
  if found then return v_run; end if;

  select net.http_get(
    url:='https://data.bs.ch/api/explore/v2.1/catalog/datasets/100462/records',
    params:='{"limit":"100","order_by":"id","select":"id,spielplatz_name,oeffnungszeiten,spielgeraete_liste,geo_point_2d"}'::jsonb,
    timeout_milliseconds:=15000
  ) into v_request;

  insert into world_knowledge_private.basel_spot_source_runs_v1(request_id)
    values (v_request) returning id into v_run;
  return v_run;
end;
$$;

create function world_knowledge_private.basel_spot_source_apply_v1(p_run bigint, p_body jsonb)
returns integer language plpgsql set search_path='' as $$
declare v_count integer;
begin
  perform 1 from world_knowledge_private.basel_spot_source_runs_v1 where id=p_run and status='FETCHING' for update;
  if not found then raise exception 'basel_spot_source_run_not_pending'; end if;

  if jsonb_typeof(p_body->'results') is distinct from 'array'
    or jsonb_typeof(p_body->'total_count') is distinct from 'number' then
    raise exception 'basel_spot_source_invalid_snapshot';
  end if;
  v_count := jsonb_array_length(p_body->'results');
  if v_count not between 1 and 100 or (p_body->>'total_count')::numeric <> v_count then
    raise exception 'basel_spot_source_incomplete_snapshot';
  end if;

  -- Reject the entire snapshot on invalid identity or geometry. Missing or
  -- invalid optional facts never become confirmed opening hours or prices.
  if exists (
    select 1 from jsonb_array_elements(p_body->'results') r
    where coalesce(r->>'id','') !~ '^[1-9][0-9]{0,8}$'
      or jsonb_typeof(r->'spielplatz_name') is distinct from 'string'
      or length(trim(r->>'spielplatz_name')) not between 1 and 160
      or case when jsonb_typeof(r#>'{geo_point_2d,lat}')='number'
              and jsonb_typeof(r#>'{geo_point_2d,lon}')='number'
         then (r#>>'{geo_point_2d,lat}')::numeric not between 47.48 and 47.62
           or (r#>>'{geo_point_2d,lon}')::numeric not between 7.50 and 7.72
         else true end
  ) or (select count(distinct r->>'id') from jsonb_array_elements(p_body->'results') r) <> v_count then
    raise exception 'basel_spot_source_invalid_records';
  end if;

  insert into world_knowledge_private.basel_spot_source_rows_v1 as existing(source_id, facts, last_seen_run_id, changed_at)
    select (r->>'id')::integer,
      jsonb_strip_nulls(jsonb_build_object(
        'name',trim(r->>'spielplatz_name'),
        'lat',(r#>>'{geo_point_2d,lat}')::double precision,
        'lng',(r#>>'{geo_point_2d,lon}')::double precision,
        'category','PLAYGROUND',
        'hours',case when jsonb_typeof(r->'oeffnungszeiten')='string' then nullif(left(trim(r->>'oeffnungszeiten'),500),'') end,
        'equipment',coalesce((
          select jsonb_agg(item order by item)
          from (select distinct left(trim(v#>>'{}'),120) as item
            from jsonb_array_elements(case when jsonb_typeof(r->'spielgeraete_liste')='array'
              then r->'spielgeraete_liste' else '[]'::jsonb end) v
            where jsonb_typeof(v)='string' and trim(v#>>'{}') <> '' order by item limit 40) equipment
        ),'[]'::jsonb)
      )),p_run,now()
    from jsonb_array_elements(p_body->'results') r
    on conflict (source_id) do update set
      previous_facts=case when existing.facts<>excluded.facts then existing.facts else existing.previous_facts end,
      changed_at=case when existing.facts<>excluded.facts then excluded.changed_at else existing.changed_at end,
      facts=excluded.facts,
      last_seen_run_id=excluded.last_seen_run_id;
  update world_knowledge_private.basel_spot_source_runs_v1
    set status='COMPLETE', finished_at=now(), source_count=v_count where id=p_run;
  return v_count;
end;
$$;

create function world_knowledge_private.basel_spot_source_collect_v1()
returns void language plpgsql set search_path='' as $$
declare
  v_run world_knowledge_private.basel_spot_source_runs_v1;
  v_response net._http_response;
begin
  select * into v_run from world_knowledge_private.basel_spot_source_runs_v1
    where status='FETCHING' for update skip locked;
  if not found then return; end if;

  select * into v_response from net._http_response
    where id=v_run.request_id and created>=v_run.started_at order by created desc limit 1;
  if not found and now()-v_run.started_at<interval '10 minutes' then return; end if;
  if v_response.id is null or v_response.status_code is distinct from 200
     or v_response.timed_out is true or v_response.error_msg is not null
     or v_response.content is null or octet_length(v_response.content)>262144 then
    update world_knowledge_private.basel_spot_source_runs_v1
      set status='FAILED',finished_at=now(),outcome='FETCH_FAILED' where id=v_run.id;
    return;
  end if;

  begin
    perform world_knowledge_private.basel_spot_source_apply_v1(v_run.id,v_response.content::jsonb);
  exception when others then
    update world_knowledge_private.basel_spot_source_runs_v1
      set status='FAILED',finished_at=now(),outcome='SNAPSHOT_REJECTED' where id=v_run.id;
  end;
end;
$$;

create function world_knowledge_private.basel_spot_source_name_v1(p_name text)
returns text language sql immutable set search_path='' as $$
  select trim(regexp_replace(regexp_replace(lower(trim(p_name)), '^spielplatz[[:space:]]+', ''), '[^[:alnum:]]+', ' ', 'g'))
$$;

create function public.admin_basel_spot_source_start_v1()
returns bigint language plpgsql security definer set search_path='' as $$
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return world_knowledge_private.basel_spot_source_start_v1();
end;
$$;

create function public.admin_basel_spot_source_preview_v1(p_source_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_latest bigint;
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select max(id) into v_latest from world_knowledge_private.basel_spot_source_runs_v1 where status='COMPLETE';

  return jsonb_build_object(
    'category_id',(select case when count(*)=1 then (array_agg(id))[1] end from public.categories where lower(trim(name))='spielplatz'),
    'runs',coalesce((select jsonb_agg(to_jsonb(recent) order by recent.id desc)
      from (select id,status,started_at,finished_at,source_count,outcome
        from world_knowledge_private.basel_spot_source_runs_v1 order by id desc limit 5) recent),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(preview) order by preview.state,preview.facts->>'name',preview.source_id)
      from (
        select r.source_id,r.facts,r.previous_facts,r.changed_at,seen.finished_at as checked_at,
          case when r.last_seen_run_id<>v_latest then 'MISSING'
            when match.identical=1 and match.possible=1 then 'MATCHED'
            when match.possible>0 then 'REVIEW'
            else 'NEW' end as state,
          match.spots
        from world_knowledge_private.basel_spot_source_rows_v1 r
        join world_knowledge_private.basel_spot_source_runs_v1 seen on seen.id=r.last_seen_run_id
        cross join lateral (
          select count(*) filter (where nearby.same_name and nearby.distance_m<=150) as identical,
            count(*) as possible,
            coalesce(jsonb_agg(jsonb_build_object('id',nearby.id,'name',nearby.name,'address',nearby.address,
              'status',nearby.status,'distance_m',round(nearby.distance_m)) order by nearby.distance_m,nearby.id),'[]'::jsonb) as spots
          from (
            select s.id,s.name,s.address,s.status,
              world_knowledge_private.basel_spot_source_name_v1(s.name)=world_knowledge_private.basel_spot_source_name_v1(r.facts->>'name') as same_name,
              111320*sqrt(power(s.lat-(r.facts->>'lat')::double precision,2)+
                power((s.lng-(r.facts->>'lng')::double precision)*cos(radians((r.facts->>'lat')::double precision)),2)) as distance_m
            from public.spots s
            where coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE')
              and s.lat between 47.47 and 47.63 and s.lng between 7.49 and 7.73
          ) nearby
          where nearby.distance_m<=45 or nearby.same_name
        ) match
        where p_source_id is null or r.source_id=p_source_id
      ) preview),'[]'::jsonb)
  );
end;
$$;

revoke all on function world_knowledge_private.basel_spot_source_start_v1(),
  world_knowledge_private.basel_spot_source_apply_v1(bigint,jsonb),
  world_knowledge_private.basel_spot_source_collect_v1(),
  world_knowledge_private.basel_spot_source_name_v1(text) from public, anon, authenticated;
revoke all on function public.admin_basel_spot_source_start_v1(),
  public.admin_basel_spot_source_preview_v1(integer) from public, anon, authenticated;
grant execute on function public.admin_basel_spot_source_start_v1(),
  public.admin_basel_spot_source_preview_v1(integer) to authenticated;

-- Cron runs with the migration owner's privileges and requires no API key.
select cron.schedule('backyrd-basel-spot-source-weekly-v1','15 3 * * 1',
  'select world_knowledge_private.basel_spot_source_start_v1()');
select cron.schedule('backyrd-basel-spot-source-collect-v1','*/2 * * * *',
  'select world_knowledge_private.basel_spot_source_collect_v1()');
