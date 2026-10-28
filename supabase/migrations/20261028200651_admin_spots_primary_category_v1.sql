-- Add current canonical category metadata to the existing Admin-only list.
-- Additive JSON response only; no profile writes, metric changes or new grants.
create or replace function public.admin_spots_intelligence_v1(
  p_from timestamptz,p_to timestamptz,p_limit integer default 500,
  p_offset integer default 0,p_search text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'not_authorized' using errcode='42501'; end if;
  with b as(
    select s.id spot_id,s.name,s.city,s.status,(s.owner_id is not null) partner,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened')) views,
      count(distinct e.user_id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to) users,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='decision_spot_impression') decision_impressions,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='decision_spot_opened') decision_opens,
      count(distinct rv.id) filter(where rv.created_at>=p_from and rv.created_at<p_to) reviews,
      count(distinct f.user_id) favorites,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='spot_route_clicked') route_clicks,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='spot_website_clicked') website_clicks,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='spot_phone_clicked') phone_clicks
    from public.spots s
    left join public.analytics_events e on e.spot_id=s.id
    left join public.reviews rv on rv.spot_id=s.id
    left join public.favorites f on f.spot_id=s.id
    where s.data_origin not in ('TEST','FIXTURE')
      and (p_search is null or concat_ws(' ',s.name,s.city) ilike '%'||p_search||'%')
    group by s.id,s.name,s.city,s.status,s.owner_id
  ), page as(
    select *,case when decision_impressions>0 then round(decision_opens*100.0/decision_impressions,1) else 0 end ctr
    from b order by views desc,name,spot_id limit greatest(1,least(p_limit,2000)) offset greatest(p_offset,0)
  )
  select jsonb_build_object('summary',jsonb_build_object('spots',(select count(*) from b),'viewed',(select count(*) from b where views>0),'partner_spots',(select count(*) from b where partner),'views',(select coalesce(sum(views),0) from b)),'categorySource','WORLD_AUTHORING_CURRENT_V1','spots',coalesce((
    select jsonb_agg(to_jsonb(page) || jsonb_build_object('primary_category',
      case when category.knowledge_state='KNOWN_VALUE'
        and category.visibility='PUBLIC' and category.stance='SUPPORTS'
        and (category.valid_from is null or category.valid_from<=now())
        and (category.valid_until is null or category.valid_until>now())
        and jsonb_typeof(category.value)='string'
        and exists(select 1 from world_knowledge_private.attribute_definitions definition
          where definition.registry_version=category.registry_version
            and definition.attribute_key='classification.primary_category'
            and definition.allowed_values @> jsonb_build_array(category.value#>>'{}'))
      then category.value#>>'{}' else null end)
      order by page.views desc,page.name,page.spot_id)
    from page
    left join lateral (
      -- Inspect the latest answer first. Never fall back to an older category
      -- when its successor is unknown, private, expired or held for review.
      select c.knowledge_state,c.value,c.visibility,c.stance,c.valid_from,c.valid_until,c.registry_version
      from world_knowledge_private.claims c
      where c.spot_id=page.spot_id and page.status='approved'
        and c.attribute_key='classification.primary_category' and c.scope='SPOT'
      order by c.last_changed_at desc,c.id desc limit 1
    ) category on true
  ),'[]'::jsonb)) into r;
  return r;
end;
$$;

