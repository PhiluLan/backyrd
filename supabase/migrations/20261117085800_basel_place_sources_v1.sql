-- Official Basel source previews. Publishing a place remains in the spot editor.
create table world_knowledge_private.spot_source_settings_v1 (
  source_key text primary key,
  enabled boolean not null default true,
  cadence text not null default 'WEEKLY' check (cadence in ('DAILY','WEEKLY','MANUAL')),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table world_knowledge_private.spot_source_settings_v1 enable row level security;
revoke all on world_knowledge_private.spot_source_settings_v1 from public, anon, authenticated;

insert into world_knowledge_private.spot_source_settings_v1(source_key)
values ('BASEL_PLAYGROUNDS'), ('BASEL_POI'), ('BASEL_SPORT');

create table world_knowledge_private.basel_spot_source_runs_v1 (
  id bigint generated always as identity primary key,
  source_key text not null default 'BASEL_PLAYGROUNDS'
    references world_knowledge_private.spot_source_settings_v1(source_key),
  request_id bigint unique not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'FETCHING' check (status in ('FETCHING','COMPLETE','FAILED')),
  source_count integer,
  outcome text,
  unique (source_key,id)
);

create unique index basel_spot_source_inflight_v2
  on world_knowledge_private.basel_spot_source_runs_v1(source_key) where status='FETCHING';

create index basel_spot_source_runs_by_source_v2
  on world_knowledge_private.basel_spot_source_runs_v1(source_key,id desc);

create table world_knowledge_private.basel_spot_source_rows_v1 (
  source_key text not null default 'BASEL_PLAYGROUNDS',
  source_id integer check (source_id > 0),
  facts jsonb not null,
  previous_facts jsonb,
  last_seen_run_id bigint not null,
  changed_at timestamptz not null,
  primary key (source_key,source_id),
  foreign key (source_key,last_seen_run_id) references world_knowledge_private.basel_spot_source_runs_v1(source_key,id)
);

alter table world_knowledge_private.basel_spot_source_runs_v1 enable row level security;
alter table world_knowledge_private.basel_spot_source_rows_v1 enable row level security;
revoke all on world_knowledge_private.basel_spot_source_runs_v1,
  world_knowledge_private.basel_spot_source_rows_v1 from public, anon, authenticated;

create table world_knowledge_private.basel_spot_source_reviews_v1 (
  source_key text not null default 'BASEL_PLAYGROUNDS',
  source_id integer not null,
  disposition text not null check (disposition in ('REVIEWED','DISMISSED','REOPENED')),
  fingerprint text not null,
  revision bigint not null default 1,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  primary key (source_key,source_id),
  foreign key (source_key,source_id) references world_knowledge_private.basel_spot_source_rows_v1(source_key,source_id)
);
alter table world_knowledge_private.basel_spot_source_reviews_v1 enable row level security;
revoke all on world_knowledge_private.basel_spot_source_reviews_v1 from public, anon, authenticated;

create function world_knowledge_private.basel_spot_source_name_v1(p_name text)
returns text language sql immutable set search_path='' as $$
  select trim(regexp_replace(regexp_replace(lower(trim(p_name)), '^spielplatz[[:space:]]+', ''), '[^[:alnum:]]+', ' ', 'g'))
$$;

create function world_knowledge_private.basel_spot_source_request_v1(p_key text)
returns table(endpoint text, params jsonb) language sql immutable set search_path='' as $$
  select registry.endpoint, registry.params from (values
    ('BASEL_PLAYGROUNDS','https://data.bs.ch/api/explore/v2.1/catalog/datasets/100462/records',
      '{"limit":"100","order_by":"id","select":"id,spielplatz_name,oeffnungszeiten,spielgeraete_liste,geo_point_2d"}'::jsonb),
    ('BASEL_POI','https://data.bs.ch/api/explore/v2.1/catalog/datasets/100015/exports/json',
      jsonb_build_object('select','name,subkategorie,art,strasse,ort,telefon,link,geo_point_2d',
      'where','subkategorie in ("Museen, Ausstellungen, Sammlungen","Konzerte, Theater, Vorträge","Aussichtspunkte","Archäologische Fundstellen","Picknickplätze","Hotel","Jugendherbergen","Seminar- und Tagungszentren","Tourist & Hotel Information") and (ort like "% Basel" or ort in ("4125 Riehen","4126 Bettingen"))')),
    ('BASEL_SPORT','https://data.bs.ch/api/explore/v2.1/catalog/datasets/100151/exports/json',
      jsonb_build_object('select','id,name,kategorie,strasse,postleitzahl,ort,link,geo_point_2d',
      'where','kategorie in ("Gartenbad","Hallenbad","Kunsteisbahn","Sportzentrum","Sporthalle","Sportplatz","Skateanlage","Spezialsportanlage","Beachsport","Street Workout / Outdoor Fitness") and ort in ("Basel","Riehen","Bettingen")'))
  ) as registry(key,endpoint,params) where registry.key=p_key
$$;

create function world_knowledge_private.basel_spot_normalize_v1(p_key text,p_body jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_rows jsonb;
begin
  if p_key='BASEL_PLAYGROUNDS' then return p_body; end if;
  if jsonb_typeof(p_body) is distinct from 'array' or jsonb_array_length(p_body) not between 1 and 500 then
    raise exception 'basel_spot_source_invalid_export';
  end if;

  if exists(select 1 from jsonb_array_elements(p_body) item
    where case p_key when 'BASEL_POI' then coalesce(item->>'ort','') !~ '^(4[0-9]{3} Basel|4125 Riehen|4126 Bettingen)$'
      when 'BASEL_SPORT' then coalesce(item->>'ort','') not in ('Basel','Riehen','Bettingen') else true end
  ) then raise exception 'basel_spot_source_outside_region'; end if;

  select jsonb_agg(jsonb_build_object(
    'id',case when p_key='BASEL_SPORT' then item->'id' else to_jsonb(
      1 + (('x'||left(md5(jsonb_build_array(item->>'name',item->>'ort',item->>'subkategorie',item->>'strasse',
        case when item->>'subkategorie'='Picknickplätze' then item->'geo_point_2d' end)::text),8))::bit(32)::bigint % 999999999)
    ) end,
    'spielplatz_name',item->'name','geo_point_2d',item->'geo_point_2d',
    'category',case
      when p_key='BASEL_SPORT' then case item->>'kategorie'
        when 'Gartenbad' then 'OUTDOOR_POOL' when 'Hallenbad' then 'SWIMMING_POOL'
        when 'Kunsteisbahn' then 'ICE_RINK' when 'Sporthalle' then 'SPORTS_CENTRE'
        when 'Sportzentrum' then 'SPORTS_CENTRE' when 'Spezialsportanlage' then 'SPORTS_CENTRE'
        when 'Sportplatz' then 'SPORTS_COURT' when 'Skateanlage' then 'SPORTS_COURT'
        when 'Beachsport' then 'SPORTS_COURT' when 'Street Workout / Outdoor Fitness' then 'SPORTS_COURT' end
      when p_key='BASEL_POI' then case item->>'subkategorie'
        when 'Museen, Ausstellungen, Sammlungen' then 'MUSEUM'
        when 'Konzerte, Theater, Vorträge' then 'EVENT_VENUE'
        when 'Aussichtspunkte' then 'VIEWPOINT' when 'Archäologische Fundstellen' then 'LANDMARK'
        when 'Picknickplätze' then 'OTHER_PLACE' when 'Hotel' then 'HOTEL' when 'Jugendherbergen' then 'HOSTEL'
        when 'Seminar- und Tagungszentren' then 'EVENT_VENUE' when 'Tourist & Hotel Information' then 'VISITOR_CENTRE' end
    end,
    'label',coalesce(item->>'subkategorie',item->>'kategorie'),
    'address',left(nullif(trim(item->>'strasse'),''),200),
    'city',left(nullif(trim(regexp_replace(item->>'ort','^[0-9]{4}[[:space:]]+','')),''),100),
    'phone',case when item->>'telefon' ~ '^[+0-9][0-9+ ()./-]{5,40}$' then item->>'telefon' end,
    'website',case when item->>'link' ~ '^https?://[A-Za-z0-9]' then left(item->>'link',1000) end
  )) into v_rows from jsonb_array_elements(p_body) item;
  if exists(select 1 from jsonb_array_elements(v_rows) item where item->>'category' is null) then
    raise exception 'basel_spot_source_unmapped_category';
  end if;
  return jsonb_build_object('total_count',jsonb_array_length(v_rows),'results',v_rows);
end;
$$;
create function world_knowledge_private.basel_spot_source_start_v2(p_key text)
returns bigint language plpgsql set search_path='' as $$
declare v_run bigint; v_request bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(14078531, 1);
  select id into v_run from world_knowledge_private.basel_spot_source_runs_v1
    where source_key=p_key and (status='FETCHING' or started_at > now() - interval '5 minutes')
    order by id desc limit 1;
  if found then return v_run; end if;

  select net.http_get(url:=endpoint,params:=params,timeout_milliseconds:=20000)
    into strict v_request from world_knowledge_private.basel_spot_source_request_v1(p_key);
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id)
    values (p_key,v_request) returning id into v_run;
  return v_run;
end;
$$;

create function world_knowledge_private.basel_spot_source_apply_v1(p_run bigint, p_body jsonb)
returns integer language plpgsql set search_path='' as $$
declare v_count integer; v_key text;
begin
  select source_key into v_key from world_knowledge_private.basel_spot_source_runs_v1 where id=p_run and status='FETCHING' for update;
  if not found then raise exception 'basel_spot_source_run_not_pending'; end if;

  p_body:=world_knowledge_private.basel_spot_normalize_v1(v_key,p_body);
  if jsonb_typeof(p_body->'results') is distinct from 'array'
    or jsonb_typeof(p_body->'total_count') is distinct from 'number' then
    raise exception 'basel_spot_source_invalid_snapshot';
  end if;
  v_count := jsonb_array_length(p_body->'results');
  if v_count not between 1 and (case when v_key='BASEL_PLAYGROUNDS' then 100 else 500 end) or (p_body->>'total_count')::numeric <> v_count then
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

  insert into world_knowledge_private.basel_spot_source_rows_v1 as existing(source_key,source_id, facts, last_seen_run_id, changed_at)
    select v_key,(r->>'id')::integer,
      jsonb_strip_nulls(jsonb_build_object(
        'name',trim(r->>'spielplatz_name'),
        'lat',(r#>>'{geo_point_2d,lat}')::double precision,
        'lng',(r#>>'{geo_point_2d,lon}')::double precision,
        'category',coalesce(r->>'category','PLAYGROUND'),
        'label',r->>'label','address',r->>'address','city',r->>'city','phone',r->>'phone','website',r->>'website',
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
    on conflict (source_key,source_id) do update set
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
  for v_run in select * from world_knowledge_private.basel_spot_source_runs_v1
    where status='FETCHING' order by id for update skip locked loop

    select * into v_response from net._http_response
      where id=v_run.request_id and created>=v_run.started_at order by created desc limit 1;
    if not found and now()-v_run.started_at<interval '10 minutes' then continue; end if;
    if v_response.id is null or v_response.status_code is distinct from 200
       or v_response.timed_out is true or v_response.error_msg is not null
       or v_response.content is null or octet_length(v_response.content)>524288 then
      update world_knowledge_private.basel_spot_source_runs_v1
        set status='FAILED',finished_at=now(),outcome='FETCH_FAILED' where id=v_run.id;
      continue;
    end if;

    begin
      perform world_knowledge_private.basel_spot_source_apply_v1(v_run.id,v_response.content::jsonb);
    exception when others then
      update world_knowledge_private.basel_spot_source_runs_v1
        set status='FAILED',finished_at=now(),outcome='SNAPSHOT_REJECTED' where id=v_run.id;
    end;
  end loop;
end;
$$;

create function world_knowledge_private.basel_spot_source_raw_preview_v1(p_key text,p_source_id integer)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_latest bigint;
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select max(id) into v_latest from world_knowledge_private.basel_spot_source_runs_v1 where status='COMPLETE' and source_key=p_key;

  return jsonb_build_object(
    'category_id',(select case when count(*)=1 then (array_agg(id))[1] end from public.categories where lower(trim(name))='spielplatz'),
    'runs',coalesce((select jsonb_agg(to_jsonb(recent) order by recent.id desc)
      from (select id,status,started_at,finished_at,source_count,outcome
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
              when 'VIEWPOINT' then 'aussichtspunkt' when 'HOTEL' then 'hotel'
              when 'HOSTEL' then 'hostel' when 'ICE_RINK' then 'eisbahn'
              when 'OUTDOOR_POOL' then 'freibad' when 'SWIMMING_POOL' then 'schwimmbad'
              when 'SPORTS_CENTRE' then 'sportzentrum' when 'SPORTS_COURT' then 'sportplatz'
              when 'EVENT_VENUE' then 'veranstaltungsort' when 'LANDMARK' then 'sehenswürdigkeit'
              else null end) as category_id
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
        where r.source_key=p_key and (p_source_id is null or r.source_id=p_source_id)
      ) preview),'[]'::jsonb)
  );
end;
$$;

create function world_knowledge_private.basel_spot_review_rows_v2(p_key text,p_rows jsonb)
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
  left join world_knowledge_private.basel_spot_source_reviews_v1 review on review.source_key=p_key and review.source_id=(item->>'source_id')::integer;
$$;

create function world_knowledge_private.basel_spot_source_dispatch_v2(p_key text,p_scheduled_at timestamptz default null)
returns bigint language plpgsql set search_path='' as $$
declare v_settings world_knowledge_private.spot_source_settings_v1;
begin
  perform pg_catalog.pg_advisory_xact_lock(14078531,1);
  select * into strict v_settings from world_knowledge_private.spot_source_settings_v1
    where source_key=p_key;

  if not v_settings.enabled then
    if p_scheduled_at is null then
      raise exception 'spot_source_disabled' using errcode='55000';
    end if;
    return null;
  end if;

  if p_scheduled_at is not null and (
    v_settings.cadence='MANUAL' or
    (v_settings.cadence='WEEKLY' and extract(isodow from p_scheduled_at at time zone 'UTC')<>1)
  ) then
    return null;
  end if;

  return world_knowledge_private.basel_spot_source_start_v2(p_key);
end;
$$;

create function public.admin_basel_spot_source_settings_v1(
  p_source_key text, p_enabled boolean, p_cadence text, p_revision text
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_settings world_knowledge_private.spot_source_settings_v1;
begin
  if v_actor is null or (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if not exists(select 1 from world_knowledge_private.spot_source_settings_v1 where source_key=p_source_key) or p_enabled is null
    or p_cadence is null or p_cadence not in ('DAILY','WEEKLY','MANUAL') then
    raise exception 'invalid_spot_source_settings' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(14078531,1);
  select * into strict v_settings from world_knowledge_private.spot_source_settings_v1 where source_key=p_source_key;
  if v_settings.revision::text is distinct from p_revision then
    raise exception 'spot_source_settings_stale' using errcode='40001';
  end if;
  if v_settings.enabled=p_enabled and v_settings.cadence=p_cadence then return; end if;

  update world_knowledge_private.spot_source_settings_v1
    set enabled=p_enabled,cadence=p_cadence,revision=revision+1,updated_at=now(),updated_by=v_actor
    where source_key=p_source_key;
end;
$$;

create function public.admin_basel_place_source_preview_v1(p_key text default 'BASEL_PLAYGROUNDS',p_source_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb;
begin
  if (select public.admin_is_admin_v1()) is not true then raise exception 'admin_required' using errcode='42501'; end if;
  if not exists(select 1 from world_knowledge_private.spot_source_settings_v1 where source_key=p_key)
    then raise exception 'invalid_spot_source' using errcode='22023'; end if;
  v_preview:=world_knowledge_private.basel_spot_source_raw_preview_v1(p_key,p_source_id);
  return jsonb_set(v_preview,'{rows}',coalesce((
    select jsonb_agg(item order by item->>'state',item#>>'{facts,name}',(item->>'source_id')::integer)
    from world_knowledge_private.basel_spot_review_rows_v2(p_key,v_preview->'rows') item
  ),'[]'::jsonb)) || jsonb_build_object('source',(
    select jsonb_build_object('key',source_key,'enabled',enabled,'cadence',cadence,'revision',revision::text,'schedule_time_utc','03:15')
    from world_knowledge_private.spot_source_settings_v1 where source_key=p_key
  ));
end;
$$;

create function public.admin_basel_place_source_start_v1(p_key text)
returns bigint language plpgsql security definer set search_path='' as $$
begin
  if (select public.admin_is_admin_v1()) is not true then raise exception 'admin_required' using errcode='42501'; end if;
  if not exists(select 1 from world_knowledge_private.spot_source_settings_v1 where source_key=p_key)
    then raise exception 'invalid_spot_source' using errcode='22023'; end if;
  return world_knowledge_private.basel_spot_source_dispatch_v2(p_key);
end;
$$;

create function public.admin_basel_place_source_review_v1(
  p_key text,
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
  perform 1 from world_knowledge_private.basel_spot_source_rows_v1 where source_key=p_key and source_id=p_source_id for update;
  if not found then raise exception 'spot_import_review_missing' using errcode='P0002'; end if;
  v_row := public.admin_basel_place_source_preview_v1(p_key,p_source_id)#>'{rows,0}';

  if v_row->>'review_fingerprint' is distinct from p_fingerprint
    or v_row->>'review_revision' is distinct from p_revision then
    raise exception 'spot_import_review_stale' using errcode='40001';
  end if;
  if (p_disposition='REOPENED' and v_row->>'review_state'='OPEN') or v_row->>'review_state'=p_disposition then
    return;
  end if;

  insert into world_knowledge_private.basel_spot_source_reviews_v1 as prior(
    source_key,source_id,disposition,fingerprint,reviewed_by
  ) values (p_key,p_source_id,p_disposition,p_fingerprint,v_actor)
  on conflict (source_key,source_id) do update set
    disposition=excluded.disposition, fingerprint=excluded.fingerprint,
    revision=prior.revision+1, reviewed_by=excluded.reviewed_by, reviewed_at=now();
end;
$$;

-- Playground-specific entry points.
create function world_knowledge_private.basel_spot_source_start_v1()
returns bigint language sql set search_path='' as $$
  select world_knowledge_private.basel_spot_source_start_v2('BASEL_PLAYGROUNDS')
$$;
create function public.admin_basel_spot_source_preview_v1(p_source_id integer default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select world_knowledge_private.basel_spot_source_raw_preview_v1('BASEL_PLAYGROUNDS',p_source_id)
$$;
create function public.admin_basel_spot_source_preview_v2(p_source_id integer default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.admin_basel_place_source_preview_v1('BASEL_PLAYGROUNDS',p_source_id)-'source'
$$;
create function public.admin_basel_spot_source_set_review_v1(p_source_id integer,p_fingerprint text,p_revision text,p_disposition text)
returns void language sql security definer set search_path='' as $$
  select public.admin_basel_place_source_review_v1('BASEL_PLAYGROUNDS',p_source_id,p_fingerprint,p_revision,p_disposition)
$$;

create function world_knowledge_private.basel_spot_source_dispatch_v1(p_scheduled_at timestamptz default null)
returns bigint language sql set search_path='' as $$
  select world_knowledge_private.basel_spot_source_dispatch_v2('BASEL_PLAYGROUNDS',p_scheduled_at)
$$;

create function public.admin_basel_spot_source_start_v1()
returns bigint language plpgsql security definer set search_path='' as $$
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return world_knowledge_private.basel_spot_source_dispatch_v1();
end;
$$;

create function public.admin_basel_spot_source_preview_v3(p_source_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb;
begin
  v_preview:=public.admin_basel_spot_source_preview_v2(p_source_id);
  return v_preview || jsonb_build_object('source',(
    select jsonb_build_object(
      'key',source_key,'enabled',enabled,'cadence',cadence,'revision',revision::text,
      'schedule_time_utc','03:15')
    from world_knowledge_private.spot_source_settings_v1 where source_key='BASEL_PLAYGROUNDS'
  ));
end;
$$;

revoke all on function world_knowledge_private.basel_spot_source_request_v1(text),
  world_knowledge_private.basel_spot_normalize_v1(text,jsonb),world_knowledge_private.basel_spot_source_start_v2(text),
  world_knowledge_private.basel_spot_source_raw_preview_v1(text,integer),world_knowledge_private.basel_spot_review_rows_v2(text,jsonb),
  world_knowledge_private.basel_spot_source_dispatch_v2(text,timestamptz),
  public.admin_basel_place_source_preview_v1(text,integer),public.admin_basel_place_source_start_v1(text),
  public.admin_basel_place_source_review_v1(text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_basel_place_source_preview_v1(text,integer),public.admin_basel_place_source_start_v1(text),
  public.admin_basel_place_source_review_v1(text,integer,text,text,text) to authenticated;

revoke all on function world_knowledge_private.basel_spot_source_start_v1(),
  world_knowledge_private.basel_spot_source_apply_v1(bigint,jsonb),
  world_knowledge_private.basel_spot_source_collect_v1(),
  world_knowledge_private.basel_spot_source_name_v1(text) from public, anon, authenticated;
revoke all on function public.admin_basel_spot_source_start_v1(),
  public.admin_basel_spot_source_preview_v1(integer) from public, anon, authenticated;
grant execute on function public.admin_basel_spot_source_start_v1(),
  public.admin_basel_spot_source_preview_v1(integer) to authenticated;

revoke all on function public.admin_basel_spot_source_preview_v2(integer),
  public.admin_basel_spot_source_set_review_v1(integer,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_basel_spot_source_preview_v2(integer),
  public.admin_basel_spot_source_set_review_v1(integer,text,text,text) to authenticated;

revoke all on function world_knowledge_private.basel_spot_source_dispatch_v1(timestamptz),
  public.admin_basel_spot_source_preview_v3(integer),
  public.admin_basel_spot_source_settings_v1(text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.admin_basel_spot_source_preview_v3(integer),
  public.admin_basel_spot_source_settings_v1(text,boolean,text,text) to authenticated;

select cron.schedule('backyrd-basel-spot-source-schedule-v1','15 3 * * *',
  'select world_knowledge_private.basel_spot_source_dispatch_v2(source_key,now()) from world_knowledge_private.spot_source_settings_v1 order by source_key');

select cron.schedule('backyrd-basel-spot-source-collect-v1','*/2 * * * *',
  'select world_knowledge_private.basel_spot_source_collect_v1()');
