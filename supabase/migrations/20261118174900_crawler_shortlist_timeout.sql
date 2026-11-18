-- Normalise names once per input set and compare addresses or coordinates only for matching names.
create or replace function public.backyrd_crawler_shortlist_v1(p_run bigint,p_web jsonb)
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
    select facts,priority,source_order,
      world_knowledge_private.basel_spot_source_name_v1(facts->>'name') as name_key
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
  ), catalog as materialized (
    select name,address,lat,lng,world_knowledge_private.basel_spot_source_name_v1(name) as name_key
    from public.spots
    where coalesce(data_origin,'LEGACY') not in ('TEST','FIXTURE')
  ), prior as materialized (
    select facts,world_knowledge_private.basel_spot_source_name_v1(facts->>'name') as name_key
    from world_knowledge_private.basel_spot_source_rows_v1 where source_key='BASEL_WEB'
  ), unseen as (
    select v.*
    from valid v
    cross join lateral (select v.facts->>'name' as name,v.facts->>'address' as address,
      (v.facts->>'lat')::double precision as lat,(v.facts->>'lng')::double precision as lng) a
    where not exists(select from catalog s where s.name_key=v.name_key
        and world_knowledge_private.crawler_same_place_v1(a.name,a.address,a.lat,a.lng,s.name,s.address,s.lat,s.lng))
      and not exists(select from prior r where r.facts->>'external_id'=v.facts->>'external_id')
      and not exists(select from prior r where r.name_key=v.name_key
        and world_knowledge_private.crawler_same_place_v1(a.name,a.address,a.lat,a.lng,
          r.facts->>'name',r.facts->>'address',(r.facts->>'lat')::double precision,(r.facts->>'lng')::double precision))
      and not exists(select from valid earlier
        where earlier.name_key=v.name_key
          and (earlier.priority,earlier.source_order)<(v.priority,v.source_order)
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
