-- The reviewed candidate remains the durable source of both discovery and enrichment.
alter table world_knowledge_private.basel_spot_source_runs_v1
  add column crawler_usage jsonb;

create or replace function public.backyrd_spot_crawler_claim_v1(p_scheduled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_settings jsonb; v_run bigint; v_slot date;
  v_now timestamp := pg_catalog.clock_timestamp() at time zone 'Europe/Zurich';
  v_searches integer; v_reserved bigint;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd-spot-crawler',0));
  select settings into strict v_settings from world_knowledge_private.spot_crawler_settings_v1;
  update world_knowledge_private.basel_spot_source_runs_v1 set status='FAILED',outcome='RUN_TIMEOUT',finished_at=now()
    where source_key='BASEL_WEB' and status='FETCHING' and started_at<now()-interval '5 minutes';
  if p_scheduled then
    if v_settings->>'schedule'='MANUAL'
      or (v_settings->>'schedule'='WEEKLY' and extract(isodow from v_now)<>1)
      or v_now::time < (v_settings->>'time')::time then return null; end if;
    v_slot:=v_now::date;
    if exists(select 1 from world_knowledge_private.basel_spot_source_runs_v1
      where source_key='BASEL_WEB' and crawler_slot=v_slot) then return null; end if;
  end if;
  if exists(select 1 from world_knowledge_private.basel_spot_source_runs_v1
    where source_key='BASEL_WEB' and status='FETCHING') then
    return jsonb_build_object('reason','RUN_ACTIVE');
  end if;
  -- Reserve discovery, at most ten missing websites and one bounded price extraction.
  v_searches:=(v_settings->>'searches')::integer + least(10,(v_settings->>'limit')::integer) + 4;
  select coalesce(sum(crawler_reserved),0) into v_reserved from world_knowledge_private.basel_spot_source_runs_v1
    where source_key='BASEL_WEB' and started_at>=date_trunc('month',v_now) at time zone 'Europe/Zurich';
  -- Each search reserves half a US cent. Failed and interrupted runs keep
  -- their reservation because provider billing may already have occurred.
  if v_reserved+v_searches>(v_settings->>'monthBudgetCents')::integer*2 then
    return jsonb_build_object('reason','BUDGET_REACHED');
  end if;
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id,crawler_settings,crawler_reserved,crawler_slot)
  values('BASEL_WEB',-(2000000000000+nextval('world_knowledge_private.basel_web_crawler_id_v1')),v_settings,v_searches,v_slot)
  returning id into v_run;
  return jsonb_build_object('id',v_run,'settings',v_settings);
end
$$;

create function world_knowledge_private.crawler_same_place_v1(
  first_name text,first_address text,first_lat double precision,first_lng double precision,
  second_name text,second_address text,second_lat double precision,second_lng double precision
) returns boolean language sql immutable set search_path='' as $$
  select world_knowledge_private.basel_spot_source_name_v1(first_name)
       = world_knowledge_private.basel_spot_source_name_v1(second_name)
    and ((nullif(trim(first_address),'') is not null and nullif(trim(second_address),'') is not null
      and world_knowledge_private.basel_spot_source_name_v1(first_address)
       = world_knowledge_private.basel_spot_source_name_v1(second_address))
      or (abs(first_lat-second_lat)<0.0004 and abs(first_lng-second_lng)<0.0006))
$$;

create function public.backyrd_crawler_shortlist_v1(p_run bigint,p_web jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_settings jsonb; v_list jsonb;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  select crawler_settings into v_settings from world_knowledge_private.basel_spot_source_runs_v1
    where id=p_run and source_key='BASEL_WEB' and status='FETCHING';
  if not found or jsonb_typeof(p_web) is distinct from 'array' or jsonb_array_length(p_web)>100
    then raise exception 'crawler_invalid_shortlist'; end if;
  with seeds as materialized (
    select item as facts,0 as priority, ordinality as source_order
    from jsonb_array_elements(p_web) with ordinality as web(item,ordinality)
    union all
    select r.facts || jsonb_build_object('external_id',encode(sha256(convert_to('overture:'||(r.facts->>'external_id'),'UTF8')),'hex'),
      'origin','OVERTURE','source_url','https://docs.overturemaps.org/guides/places/',
      'observed_at',snapshot.finished_at),1,r.source_id::bigint
    from world_knowledge_private.basel_spot_source_rows_v1 r
    join world_knowledge_private.basel_spot_source_runs_v1 snapshot on snapshot.id=r.last_seen_run_id
    where r.source_key='BASEL_OVERTURE' and snapshot.id=(
      select max(id) from world_knowledge_private.basel_spot_source_runs_v1 where source_key='BASEL_OVERTURE' and status='COMPLETE')
      and exists(select from world_knowledge_private.spot_source_settings_v1 where source_key='BASEL_OVERTURE' and enabled)
      -- The imported Overture release has city scope; a specific neighbourhood
      -- must be substantiated by the web source.
      and v_settings->'districts' ? 'Basel'
      and not exists(select from world_knowledge_private.basel_spot_source_reviews_v1 review
        where review.source_key=r.source_key and review.source_id=r.source_id and review.disposition='DISMISSED')
  ), valid as materialized (
    select facts,priority,source_order
    from seeds
    where v_settings->'categories' ? (facts->>'category')
      and length(trim(facts->>'name')) between 1 and 160
      and length(trim(facts->>'address')) between 4 and 240
      and (facts->>'external_id') ~ '^[a-f0-9]{64}$'
      and (facts->>'source_url') ~ '^https://'
      and (priority=1 or (facts->>'website') ~ '^https://')
      and case when jsonb_typeof(facts->'lat')='number' and jsonb_typeof(facts->'lng')='number'
        then (facts->>'lat')::numeric between 47.519 and 47.599
          and (facts->>'lng')::numeric between 7.554 and 7.635 else false end
  ), unseen as (
    select v.*
    from valid v
    cross join lateral (select v.facts->>'name' as name,v.facts->>'address' as address,
      (v.facts->>'lat')::double precision as lat,(v.facts->>'lng')::double precision as lng) a
    where not exists(select from public.spots s
      where coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE')
        and world_knowledge_private.crawler_same_place_v1(a.name,a.address,a.lat,a.lng,s.name,s.address,s.lat,s.lng))
      and not exists(select from world_knowledge_private.basel_spot_source_rows_v1 r
        where r.source_key='BASEL_WEB' and (r.facts->>'external_id'=v.facts->>'external_id'
          or world_knowledge_private.crawler_same_place_v1(a.name,a.address,a.lat,a.lng,
            r.facts->>'name',r.facts->>'address',(r.facts->>'lat')::double precision,(r.facts->>'lng')::double precision)))
      and not exists(select from valid earlier
        where (earlier.priority,earlier.source_order)<(v.priority,v.source_order)
          and world_knowledge_private.crawler_same_place_v1(a.name,a.address,a.lat,a.lng,earlier.facts->>'name',
            earlier.facts->>'address',(earlier.facts->>'lat')::double precision,(earlier.facts->>'lng')::double precision))
  ), mixed as (
    select facts,priority,row_number() over(partition by priority order by source_order) as rank from unseen
  )
  select coalesce(jsonb_agg(facts order by rank,priority),'[]'::jsonb) into v_list
  from (select * from mixed order by rank,priority limit (v_settings->>'limit')::integer) chosen;
  return v_list;
end
$$;

-- Writes enriched results once, using the existing candidate transaction.
-- Old workers can still write their original WEB-only candidate format.
create function public.backyrd_crawler_finish_basics_v1(p_run bigint,p_candidates jsonb,p_usage jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_run world_knowledge_private.basel_spot_source_runs_v1; v_count integer;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd-spot-crawler',0));
  select * into v_run from world_knowledge_private.basel_spot_source_runs_v1
    where id=p_run and source_key='BASEL_WEB' for update;
  if not found then raise exception 'crawler_run_missing'; end if;
  if v_run.status='COMPLETE' then return v_run.source_count; end if;
  if v_run.status<>'FETCHING' or jsonb_typeof(p_candidates) is distinct from 'array'
    or jsonb_array_length(p_candidates)>(v_run.crawler_settings->>'limit')::integer
    or octet_length(p_candidates::text)>300000 or octet_length(p_usage::text)>1000
    then raise exception 'crawler_invalid_candidates'; end if;

  update world_knowledge_private.basel_spot_source_rows_v1
    set last_seen_run_id=p_run where source_key='BASEL_WEB';
  insert into world_knowledge_private.basel_spot_source_rows_v1(source_key,source_id,facts,last_seen_run_id,changed_at)
  select 'BASEL_WEB',nextval('world_knowledge_private.basel_web_crawler_id_v1')::integer,
    item || '{"city":"Basel","equipment":[]}'::jsonb,p_run,now()
  from jsonb_array_elements(p_candidates) item
  where item->>'external_id' ~ '^[a-f0-9]{64}$'
    and not exists(select from public.spots s where coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE')
      and world_knowledge_private.crawler_same_place_v1(item->>'name',item->>'address',
        (item->>'lat')::double precision,(item->>'lng')::double precision,s.name,s.address,s.lat,s.lng))
  on conflict do nothing;
  get diagnostics v_count=row_count;
  update world_knowledge_private.basel_spot_source_runs_v1 set status='COMPLETE',finished_at=now(),
    source_count=v_count,crawler_usage=p_usage where id=p_run;
  return v_count;
end
$$;

revoke all on function world_knowledge_private.crawler_same_place_v1(text,text,double precision,double precision,text,text,double precision,double precision)
  from public,anon,authenticated,service_role;
revoke all on function public.backyrd_crawler_shortlist_v1(bigint,jsonb),
  public.backyrd_crawler_finish_basics_v1(bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.backyrd_crawler_shortlist_v1(bigint,jsonb),
  public.backyrd_crawler_finish_basics_v1(bigint,jsonb,jsonb) to service_role;

create or replace function public.admin_backyrd_crawler_approve_spot_v1(
  p_source_id integer,p_fingerprint text,p_revision text,p_category_id uuid,p_confirm_distinct boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_spot uuid; v_data jsonb; v_hours jsonb; v_price jsonb; v_fields jsonb; v_field record;
  v_observed timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null or public.admin_is_admin_v1() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('basel-place-source-create-spot',0));
  select spot_id into v_spot from world_knowledge_private.basel_spot_source_imports_v1
    where source_key='BASEL_WEB' and source_id=p_source_id;
  if found then return v_spot; end if;
  v_spot:=world_knowledge_private.basel_place_source_create_spot_v2(
    'BASEL_WEB',p_source_id,p_fingerprint,p_revision,p_category_id,p_confirm_distinct);
  select source_facts->'basics' into v_data from world_knowledge_private.basel_spot_source_imports_v1
    where source_key='BASEL_WEB' and source_id=p_source_id;
  if v_data is null then return v_spot; end if;
  update public.spots set
    email=coalesce(v_data->>'email',email),
    phone=coalesce(v_data->>'phone',phone),
    website=coalesce(v_data->>'website',website)
  where id=v_spot;

  v_hours:=v_data->'fullHours';
  if jsonb_typeof(v_hours)='array' and jsonb_array_length(v_hours)=7 then
    insert into public.spot_hours(spot_id,day_of_week,open_time,close_time,idx)
    select v_spot, days.label, (slot->>'start')::time,(slot->>'end')::time,(row_number() over(order by day_order,ordinality)-1)::integer
    from jsonb_array_elements(v_hours) with ordinality as d(day,day_order)
    join (values ('MONDAY','Montag'),('TUESDAY','Dienstag'),('WEDNESDAY','Mittwoch'),
      ('THURSDAY','Donnerstag'),('FRIDAY','Freitag'),('SATURDAY','Samstag'),('SUNDAY','Sonntag'))
      days(key,label) on days.key=day->>'day'
    cross join lateral jsonb_array_elements(day->'intervals') with ordinality as i(slot,ordinality);
  end if;

  v_price:=v_data->'fixedAdmission';
  if not world_knowledge_private.product_admin_authoring_active_v1() then return v_spot; end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'identity.name', name, 'location.address_line1', address, 'location.locality',city,
    'location.country_code','CH','location.timezone','Europe/Zurich',
    'location.latitude',lat,'location.longitude',lng,
    'contact.website',case when website ~ '^https://' then website end,
    'contact.public_email',email,'contact.phone',v_data->>'phone'
  )) into v_fields from public.spots where id=v_spot;
  if jsonb_typeof(v_hours)='array' and jsonb_array_length(v_hours)=7 then
    v_fields:=v_fields || jsonb_build_object('hours.regular',v_hours);
  end if;
  if jsonb_typeof(v_price)='number' then
    v_fields:=v_fields || jsonb_build_object('operation.price_options',jsonb_build_array(jsonb_build_object('currency','CHF','min',v_price,'max',v_price,
        'purposes',jsonb_build_array('ADMISSION'),'allOfferingsCovered',false,'basis','PER_PERSON',
        'minimumAge',null,'maximumAge',null,'mandatoryFeesIncluded',false,'conditions',
        '{"days":[],"dayparts":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}'::jsonb)));
  end if;
  for v_field in select key,value from jsonb_each(v_fields) order by key loop
    perform public.world_product_admin_submit_claim_v1(v_spot,v_field.key,'KNOWN_VALUE',v_field.value,
      v_observed,null,null,'PUBLIC',null,'crawler-basics:'||p_source_id::text||':'||v_field.key);
  end loop;
  perform world_knowledge_private.publish_approved_spot_search_v1(v_spot);
  return v_spot;
end
$$;

create function public.admin_backyrd_crawler_run_usage_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.admin_is_admin_v1() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return coalesce((select jsonb_object_agg(id::text,crawler_usage) from (
    select id,crawler_usage from world_knowledge_private.basel_spot_source_runs_v1
    where source_key='BASEL_WEB' order by id desc limit 5
  ) recent where crawler_usage is not null),'{}'::jsonb);
end
$$;
revoke all on function public.admin_backyrd_crawler_run_usage_v1() from public,anon,authenticated,service_role;
grant execute on function public.admin_backyrd_crawler_run_usage_v1() to authenticated;

create or replace function public.spot_place_source_credit_v1(p_spot_id uuid)
returns table(credit text, source_url text, license_url text)
language sql stable security definer set search_path='' as $$
  select
    case i.source_key
      when 'BASEL_PLAYGROUNDS' then 'Stadtgärtnerei Basel-Stadt via Open Data Basel-Stadt'
      when 'BASEL_OVERTURE' then concat_ws(' · ', 'Overture Maps Foundation',
        (select string_agg(item, ', ' order by item)
          from jsonb_array_elements_text(i.source_facts->'attribution') item))
      when 'BASEL_WEB' then case when i.source_facts->>'origin'='OVERTURE' then
        concat_ws(' · ', 'Overture Maps Foundation',
          (select string_agg(item, ', ' order by item)
           from jsonb_array_elements_text(i.source_facts->'attribution') item))
        else concat_ws(' · ', 'Website des Orts', i.source_facts->>'coordinates_source') end
      else 'Geodaten Kanton Basel-Stadt via Open Data Basel-Stadt'
    end,
    case i.source_key
      when 'BASEL_PLAYGROUNDS' then 'https://data.bs.ch/explore/dataset/100462/'
      when 'BASEL_POI' then 'https://data.bs.ch/explore/dataset/100015/'
      when 'BASEL_SPORT' then 'https://data.bs.ch/explore/dataset/100151/'
      when 'BASEL_OVERTURE' then 'https://docs.overturemaps.org/guides/places/'
      when 'BASEL_WEB' then i.source_facts->>'source_url'
    end,
    case when i.source_key='BASEL_OVERTURE' or (i.source_key='BASEL_WEB' and i.source_facts->>'origin'='OVERTURE') then 'https://docs.overturemaps.org/attribution/'
      when i.source_key='BASEL_WEB' then null
      else 'https://creativecommons.org/licenses/by/4.0/' end
  from world_knowledge_private.basel_spot_source_imports_v1 i
  join public.spots s on s.id=i.spot_id
  where i.spot_id=p_spot_id and s.status='approved'
$$;
